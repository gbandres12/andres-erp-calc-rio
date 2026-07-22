import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id: invoiceId } = await req.json();
    if (!invoiceId) return Response.json({ error: 'invoice_id obrigatório' }, { status: 400 });
    const invoice = await base44.entities.FiscalInvoice.get(invoiceId);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });
    if (!['rascunho', 'pendente_envio', 'rejeitada', 'erro_integracao'].includes(invoice.status)) {
      return Response.json({ error: `Nota não pode ser emitida com status: ${invoice.status}` }, { status: 400 });
    }

    const reject = async (message) => {
      await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, { error_message: message, error_code: 'VALIDACAO' });
      return Response.json({ error: message }, { status: 400 });
    };

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    const configError = validateConfig(config, invoice);
    if (configError) return await reject(configError);
    const secretName = config.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs desta empresa não configurada (segredo ${secretName})` }, { status: 500 });
    const invoiceError = validateInvoice(invoice);
    if (invoiceError) return await reject(invoiceError);

    const products = await Promise.all(invoice.items.map(async (item) => item.product_id
      ? await base44.asServiceRole.entities.Product.get(item.product_id)
      : null));
    const items = [];
    for (let index = 0; index < invoice.items.length; index += 1) {
      const error = validateProduct(products[index], config, invoice, index);
      if (error) return await reject(error);
      items.push(snapshotItem(invoice.items[index], products[index], config, invoice));
    }

    const auditedInvoice = { ...invoice, items };
    const payload = buildPayload(auditedInvoice, config);
    const summary = summarize(payload, auditedInvoice, config);
    await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, { items, status: 'validando', error_message: '', error_code: '' });

    const started = Date.now();
    let response;
    let data;
    try {
      response = await fetch('https://platform.notaas.com.br/api/v1/nfe/emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Idempotency-Key': invoice.idempotency_key || invoice.reference
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      const text = await response.text();
      try { data = text ? JSON.parse(text) : {}; }
      catch { data = { message: text || `HTTP ${response.status}` }; }
    } catch (fetchError) {
      await recordFailure(base44, invoice, invoiceId, user.id, fetchError.message, Date.now() - started, 502, {}, summary);
      return Response.json({ error: 'Erro de comunicação com a NotaAs', details: fetchError.message }, { status: 502 });
    }

    const duration = Date.now() - started;
    if (!response.ok) {
      const message = extractError(data, response.status);
      await recordFailure(base44, invoice, invoiceId, user.id, message, duration, response.status, data, summary);
      return Response.json({ error: message }, { status: response.status });
    }

    const status = data.status === 'issued' ? 'autorizada' : 'processando';
    const updateData = {
      status,
      api_reference: data.invoiceId,
      api_status: data.status || 'queued',
      last_status_check: new Date().toISOString(),
      error_message: '',
      error_code: ''
    };
    if (data.chaveAcesso) updateData.api_access_key = data.chaveAcesso;
    if (data.nProt) updateData.api_protocol = data.nProt;
    if (data.nNf) updateData.number = Number(data.nNf);
    if (data.serie) updateData.serie = String(data.serie);
    await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, updateData);
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      event_type: 'emissao',
      status: 'sucesso',
      http_status: response.status,
      request_summary: JSON.stringify(summary),
      response_summary: JSON.stringify(data).slice(0, 500),
      duration_ms: duration,
      triggered_by: user.id
    });
    return Response.json({ success: true, status, data: updateData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function validateConfig(config, invoice) {
  if (!config) return 'Configuração fiscal não encontrada';
  if (!config.cnpj || !config.razao_social || !config.inscricao_estadual) return 'Dados do EMITENTE incompletos: preencha CNPJ, razão social e Inscrição Estadual da empresa em Config. Fiscal';
  if (![1, 2, 3].includes(Number(config.crt))) return 'CRT inválido';
  if (config.regime_tributario === 'simples_nacional' && Number(config.crt) === 3) return 'Simples Nacional deve usar CRT 1 ou 2';
  if (['lucro_real', 'lucro_presumido'].includes(config.regime_tributario) && Number(config.crt) !== 3) {
    return `${config.regime_tributario === 'lucro_real' ? 'Lucro Real' : 'Lucro Presumido'} deve usar CRT 3 (Regime Normal)`;
  }
  if (!['homologacao', 'producao'].includes(config.environment)) return 'Ambiente fiscal inválido';
  if (invoice.environment !== config.environment) return 'Ambiente da nota diferente do ambiente fiscal ativo';
  if (!config.serie || String(invoice.serie) !== String(config.serie)) return 'Série diferente da configuração fiscal';
  if (!['nfe', 'nfce'].includes(invoice.document_type)) return 'Somente NF-e e NFC-e são aceitas';
  return null;
}

function validateInvoice(invoice) {
  const address = invoice.recipient_address || {};
  if (!invoice.recipient_name || !invoice.recipient_cpf_cnpj) return 'Informe o destinatário completo';
  if (!address.logradouro || !address.bairro || !address.municipio || !address.uf || !address.cep) return 'Complete o endereço do destinatário';
  if (!/^\d{7}$/.test(String(address.codigoMunicipio || ''))) return 'Código IBGE do destinatário inválido';
  if (!invoice.items?.length) return 'Adicione ao menos um item';
  if (!(Number(invoice.total) > 0)) return 'O total deve ser maior que zero';
  return null;
}

function validateProduct(product, config, invoice, index) {
  const position = index + 1;
  if (!product) return `Selecione um produto cadastrado no item ${position}`;
  if (product.company_id !== invoice.company_id) return `Produto do item ${position} pertence a outra empresa`;
  if (!product.accountant_approved || !product.fiscal_review_date) return `Produto ${product.name} sem aprovação fiscal do contador`;
  if (!product.fiscal_description) return `Descrição fiscal ausente no produto ${product.name}`;
  if (!/^\d{8}$/.test(String(product.ncm || '').replace(/\D/g, ''))) return `NCM inválido no produto ${product.name}`;
  const internal = config.uf === invoice.recipient_address?.uf;
  const cfop = internal ? product.cfop_internal : product.cfop_interstate;
  if (!/^\d{4}$/.test(String(cfop || '').replace(/\D/g, ''))) return `CFOP ${internal ? 'interno' : 'interestadual'} inválido no produto ${product.name}`;
  if (!product.tax_classification) return `Classificação fiscal ausente no produto ${product.name}`;
  const crt = Number(config.crt);
  const code = crt === 1 ? product.icms_csosn : product.icms_cst;
  if (crt === 1 && !/^\d{3}$/.test(String(code || ''))) return `CSOSN inválido no produto ${product.name}`;
  if (crt !== 1 && !/^\d{2}$/.test(String(code || ''))) return `CST inválido no produto ${product.name}`;
  if (!classificationMatches(product.tax_classification, code, crt)) return `CST/CSOSN incompatível com a classificação do produto ${product.name}`;
  if (!product.icms_aliquota_configurada) return `Configure a alíquota de ICMS do produto ${product.name}, inclusive quando for 0%`;
  if (!product.pis_cst || !product.pis_aliquota_configurada) return `Configure CST e alíquota de PIS do produto ${product.name}`;
  if (!product.cofins_cst || !product.cofins_aliquota_configurada) return `Configure CST e alíquota de COFINS do produto ${product.name}`;
  return null;
}

function classificationMatches(classification, code, crt) {
  const cst = {
    tributada_integralmente: ['00'], isenta: ['40'], nao_tributada: ['41'], diferida: ['51'], suspensa: ['50'],
    icms_cobrado_anteriormente: ['60'], substituicao_tributaria: ['10', '30', '60', '70'],
    outra: ['00', '10', '20', '30', '40', '41', '50', '51', '60', '70', '90']
  };
  const csosn = {
    tributada_integralmente: ['101', '102', '201', '202'], isenta: ['103'], nao_tributada: ['300', '400'],
    icms_cobrado_anteriormente: ['500'], substituicao_tributaria: ['201', '202', '203', '500'], outra: ['900']
  };
  return (crt === 1 ? csosn : cst)[classification]?.includes(String(code)) || false;
}

function snapshotItem(item, product, config, invoice) {
  const internal = config.uf === invoice.recipient_address?.uf;
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unit_price);
  const discount = Number(item.discount || 0);
  const total = Number(item.total) > 0 ? Number(item.total) : round2(quantity * unitPrice - discount);
  const base = Math.max(0, total);
  const crt = Number(config.crt);
  return {
    ...item,
    product_id: product.id,
    product_name: product.fiscal_description,
    product_code: product.code,
    ncm: String(product.ncm).replace(/\D/g, ''),
    cest: product.cest || '',
    cfop: String(internal ? product.cfop_internal : product.cfop_interstate).replace(/\D/g, ''),
    unit: product.unit,
    tax_classification: product.tax_classification,
    cst: crt === 1 ? '' : product.icms_cst,
    csosn: crt === 1 ? product.icms_csosn : '',
    icms_cst: product.icms_cst || '',
    icms_csosn: product.icms_csosn || '',
    icms_base: base,
    icms_aliquota: Number(product.icms_aliquota),
    icms_aliquota_configurada: true,
    icms_valor: round2(base * Number(product.icms_aliquota) / 100),
    pis_cst: product.pis_cst,
    pis_base: base,
    pis_aliquota: Number(product.pis_aliquota),
    pis_aliquota_configurada: true,
    pis_valor: round2(base * Number(product.pis_aliquota) / 100),
    cofins_cst: product.cofins_cst,
    cofins_base: base,
    cofins_aliquota: Number(product.cofins_aliquota),
    cofins_aliquota_configurada: true,
    cofins_valor: round2(base * Number(product.cofins_aliquota) / 100),
    ibs_cbs_cst: product.ibs_cbs_cst || '',
    classificacao_tributaria: product.classificacao_tributaria || '',
    ibs_aliquota: Number(product.ibs_aliquota || 0),
    ibs_aliquota_configurada: !!product.ibs_aliquota_configurada,
    cbs_aliquota: Number(product.cbs_aliquota || 0),
    cbs_aliquota_configurada: !!product.cbs_aliquota_configurada,
    accountant_approved: true,
    fiscal_review_date: product.fiscal_review_date,
    quantity,
    unit_price: unitPrice,
    discount,
    total
  };
}

function buildPayload(invoice, config) {
  const document = invoice.recipient_cpf_cnpj.replace(/\D/g, '');
  const address = invoice.recipient_address;
  const dest = {
    nome: invoice.recipient_name,
    endereco: {
      logradouro: address.logradouro,
      numero: address.numero || 'SN',
      bairro: address.bairro,
      codigoMunicipio: Number(address.codigoMunicipio),
      cidade: address.municipio,
      uf: address.uf,
      cep: address.cep.replace(/\D/g, '')
    }
  };
  dest[document.length === 14 ? 'cnpj' : 'cpf'] = document;
  dest.indicadorIE = invoice.recipient_ie ? 1 : 9;
  if (invoice.recipient_ie) dest.ie = invoice.recipient_ie;
  if (invoice.recipient_email) dest.email = invoice.recipient_email;
  return {
    modelo: invoice.document_type === 'nfce' ? 65 : 55,
    naturezaOperacao: invoice.nature_operation,
    destinoOperacao: config.uf !== address.uf ? 2 : 1,
    tipoOperacao: 1,
    finalidade: 1,
    consumidorFinal: invoice.recipient_ie ? 0 : 1,
    presencaComprador: 1,
    dest,
    items: invoice.items.map((item) => {
      const mapped = {
        codigo: item.product_code,
        descricao: item.product_name,
        ncm: item.ncm,
        cfop: item.cfop,
        unidade: item.unit,
        quantidade: Number(item.quantity),
        valorUnitario: Number(item.unit_price),
        valorTotal: Number(item.total),
        desconto: Number(item.discount || 0),
        aliquotaIcms: Number(item.icms_aliquota),
        aliquotaPis: Number(item.pis_aliquota),
        aliquotaCofins: Number(item.cofins_aliquota)
      };
      if (Number(config.crt) === 1) mapped.csosn = item.csosn;
      else mapped.cst = item.cst;
      return mapped;
    }),
    pagamentos: [{ tipoPagamento: invoice.payment_method, valor: Number(invoice.total) }],
    infCpl: sanitize(invoice.notes),
    transporte: buildTransporte(invoice.transporte)
  };
}

function buildTransporte(t) {
  const out = { modalidadeFrete: ['0', '1', '2', '3', '4', '9'].includes(String(t?.modalidade_frete)) ? Number(t.modalidade_frete) : 9 };
  const tr = t?.transportadora || {};
  const doc = String(tr.cpf_cnpj || '').replace(/\D/g, '');
  if (out.modalidadeFrete !== 9 && (tr.nome || doc)) {
    out.transportadora = {};
    if (doc.length === 14) out.transportadora.cnpj = doc;
    else if (doc.length === 11) out.transportadora.cpf = doc;
    if (tr.nome) out.transportadora.nome = tr.nome;
    if (tr.ie) out.transportadora.ie = tr.ie;
    if (tr.endereco) out.transportadora.endereco = tr.endereco;
    if (tr.cidade) out.transportadora.cidade = tr.cidade;
    if (tr.uf) out.transportadora.uf = tr.uf;
  }
  const v = t?.veiculo || {};
  if (out.modalidadeFrete !== 9 && v.placa) {
    out.veiculo = { placa: String(v.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') };
    if (v.uf) out.veiculo.uf = v.uf;
    if (v.rntc) out.veiculo.rntc = v.rntc;
  }
  const vol = t?.volume || {};
  if (Number(vol.quantidade) > 0 || vol.especie || Number(vol.peso_bruto) > 0) {
    const volume = {};
    if (Number(vol.quantidade) > 0) volume.quantidade = Number(vol.quantidade);
    if (vol.especie) volume.especie = vol.especie;
    if (vol.marca) volume.marca = vol.marca;
    if (vol.numeracao) volume.numeracao = vol.numeracao;
    if (Number(vol.peso_liquido) > 0) volume.pesoLiquido = Number(vol.peso_liquido);
    if (Number(vol.peso_bruto) > 0) volume.pesoBruto = Number(vol.peso_bruto);
    out.volumes = [volume];
  }
  return out;
}

function summarize(payload, invoice, config) {
  return {
    ambienteLocal: invoice.environment,
    modelo: payload.modelo,
    serieLocal: invoice.serie,
    numeroLocal: invoice.number || null,
    crt: Number(config.crt),
    itens: payload.items.map((item, index) => ({
      codigo: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm,
      cfop: item.cfop,
      unidade: item.unidade,
      cst: item.cst || null,
      csosn: item.csosn || null,
      aliquotaIcms: item.aliquotaIcms,
      aliquotaPis: item.aliquotaPis,
      aliquotaCofins: item.aliquotaCofins,
      aliquotaIbs: invoice.items[index].ibs_aliquota,
      aliquotaCbs: invoice.items[index].cbs_aliquota,
      valorTotal: item.valorTotal
    })),
    valorPagamento: Number(payload.pagamentos.reduce((sum, item) => sum + item.valor, 0).toFixed(2))
  };
}

function round2(value) { return Number(Number(value || 0).toFixed(2)); }
function sanitize(value) {
  const text = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return text || undefined;
}
function extractError(data, status) {
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (Array.isArray(data?.errors)) return data.errors.map((item) => item.message || item.msg).filter(Boolean).join('; ');
  return `A NotaAs recusou a emissão (HTTP ${status})`;
}
async function recordFailure(base44, invoice, invoiceId, userId, message, duration, httpStatus, apiData, summary) {
  await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, {
    status: 'erro_integracao',
    error_message: message,
    error_code: String(httpStatus),
    retry_count: (invoice.retry_count || 0) + 1
  });
  await base44.asServiceRole.entities.FiscalEvent.create({
    invoice_id: invoiceId,
    company_id: invoice.company_id,
    event_type: 'emissao',
    status: 'erro',
    http_status: httpStatus,
    request_summary: JSON.stringify(summary),
    response_summary: JSON.stringify(apiData).slice(0, 500),
    duration_ms: duration,
    error_message: message,
    triggered_by: userId
  });
}