// emitFiscalInvoice - Emite NF-e/NFC-e via NotaAs
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

    const apiKey = Deno.env.get('NOTAAS_PROJECT_KEY');
    if (!apiKey) return Response.json({ error: 'Chave de projeto da NotaAs não configurada' }, { status: 500 });

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    if (!config) return Response.json({ error: 'Configuração fiscal não encontrada para esta empresa' }, { status: 400 });

    const validationError = validateInvoice(invoice);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const payload = buildNotaAsPayload(invoice, config);
    const payloadSummary = summarizePayload(payload);
    const startTime = Date.now();
    let apiResponse;
    let apiData;

    try {
      apiResponse = await fetch('https://platform.notaas.com.br/api/v1/nfe/emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Idempotency-Key': invoice.idempotency_key || invoice.reference
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      const responseText = await apiResponse.text();
      try {
        apiData = responseText ? JSON.parse(responseText) : {};
      } catch {
        apiData = { message: responseText || `HTTP ${apiResponse.status}` };
      }
    } catch (fetchError) {
      await recordFailure(base44, invoice, invoiceId, user.id, fetchError.message, Date.now() - startTime, 502, {}, payloadSummary);
      return Response.json({ error: 'Erro de comunicação com a NotaAs', details: fetchError.message }, { status: 502 });
    }

    const duration = Date.now() - startTime;
    if (!apiResponse.ok) {
      const errorMessage = extractError(apiData, apiResponse.status);
      await recordFailure(base44, invoice, invoiceId, user.id, errorMessage, duration, apiResponse.status, apiData, payloadSummary);
      return Response.json({ error: errorMessage }, { status: apiResponse.status });
    }

    const apiReference = apiData.invoiceId;
    const status = apiData.status === 'issued' ? 'autorizada' : 'processando';
    const updateData = {
      status,
      api_reference: apiReference,
      api_status: apiData.status || 'queued',
      last_status_check: new Date().toISOString(),
      error_message: '',
      error_code: ''
    };
    if (apiData.chaveAcesso) updateData.api_access_key = apiData.chaveAcesso;
    if (apiData.nProt) updateData.api_protocol = apiData.nProt;

    await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, updateData);
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      event_type: 'emissao',
      status: 'sucesso',
      http_status: apiResponse.status,
      request_summary: JSON.stringify(payloadSummary),
      response_summary: JSON.stringify(apiData).slice(0, 500),
      duration_ms: duration,
      triggered_by: user.id
    });

    return Response.json({ success: true, status, data: updateData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function validateInvoice(invoice) {
  const address = invoice.recipient_address || {};
  if (!invoice.recipient_name) return 'Informe o nome do destinatário';
  if (!invoice.recipient_cpf_cnpj) return 'Informe o CPF ou CNPJ do destinatário';
  if (!address.logradouro || !address.bairro || !address.municipio || !address.uf || !address.cep) {
    return 'Complete o endereço do destinatário: logradouro, bairro, município, UF e CEP';
  }
  if (!/^\d{7}$/.test(String(address.codigoMunicipio || ''))) return 'Informe o código IBGE de 7 dígitos do município do destinatário';
  if (!invoice.items?.length) return 'Adicione pelo menos um item à nota';
  for (const [index, item] of invoice.items.entries()) {
    if (!item.product_name) return `Informe a descrição do produto no item ${index + 1}`;
    if (!/^\d{8}$/.test(String(item.ncm || '').replace(/\D/g, ''))) return `Informe um NCM de 8 dígitos no item ${index + 1}`;
    if (!/^\d{4}$/.test(String(item.cfop || '').replace(/\D/g, ''))) return `Informe um CFOP de 4 dígitos no item ${index + 1}`;
    if (!(Number(item.quantity) > 0)) return `A quantidade do item ${index + 1} deve ser maior que zero`;
    if (!(Number(item.unit_price) > 0)) return `O valor unitário do item ${index + 1} deve ser maior que zero`;
  }
  if (!(Number(invoice.total) > 0)) return 'O valor total da nota deve ser maior que zero';
  return null;
}

function buildNotaAsPayload(invoice, config) {
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
  if (invoice.recipient_ie) {
    dest.ie = invoice.recipient_ie;
    dest.indicadorIE = 1;
  } else {
    dest.indicadorIE = 9;
  }
  if (invoice.recipient_email) dest.email = invoice.recipient_email;

  return {
    modelo: invoice.document_type === 'nfce' ? 65 : 55,
    naturezaOperacao: invoice.nature_operation || 'Venda de mercadoria',
    destinoOperacao: config.uf && address.uf && config.uf !== address.uf ? 2 : 1,
    tipoOperacao: 1,
    finalidade: 1,
    consumidorFinal: invoice.recipient_ie ? 0 : 1,
    presencaComprador: 1,
    dest,
    items: invoice.items.map((item, index) => {
      const fiscalCode = item.icms_cst || item.cst;
      const quantidade = Number(item.quantity);
      const valorUnitario = Number(item.unit_price);
      const totalInformado = Number(item.total);
      const valorTotal = totalInformado > 0 ? totalInformado : Number((quantidade * valorUnitario).toFixed(2));
      const mapped = {
        codigo: item.product_code || `PRD${String(index + 1).padStart(3, '0')}`,
        descricao: item.product_name,
        ncm: String(item.ncm || '').replace(/\D/g, ''),
        cfop: String(item.cfop || '5102').replace(/\D/g, ''),
        unidade: item.unit || 'UN',
        quantidade,
        valorUnitario,
        valorTotal,
        desconto: Number(item.discount || 0)
      };
      if (fiscalCode) mapped[fiscalCode.length === 3 ? 'csosn' : 'cst'] = fiscalCode;
      if (Number(item.icms_aliquota) > 0) mapped.aliquotaIcms = Number(item.icms_aliquota);
      if (Number(item.pis_aliquota) > 0) mapped.aliquotaPis = Number(item.pis_aliquota);
      if (Number(item.cofins_aliquota) > 0) mapped.aliquotaCofins = Number(item.cofins_aliquota);
      return mapped;
    }),
    pagamentos: [{
      tipoPagamento: invoice.payment_method || '99',
      valor: Number(invoice.total)
    }],
    infCpl: sanitizeFiscalText(invoice.notes)
  };
}

function summarizePayload(payload) {
  return {
    modelo: payload.modelo,
    naturezaOperacao: payload.naturezaOperacao,
    destinatarioInformado: Boolean(payload.dest?.nome && (payload.dest?.cpf || payload.dest?.cnpj)),
    quantidadeItens: payload.items.length,
    produtos: payload.items.map((item) => item.descricao),
    valorProdutos: Number(payload.items.reduce((sum, item) => sum + item.valorTotal, 0).toFixed(2)),
    valorPagamento: Number(payload.pagamentos.reduce((sum, item) => sum + item.valor, 0).toFixed(2))
  };
}

function sanitizeFiscalText(value) {
  const sanitized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || undefined;
}

function extractError(data, status) {
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (Array.isArray(data?.errors)) return data.errors.map((item) => item.message || item.msg).filter(Boolean).join('; ');
  return `A NotaAs recusou a emissão (HTTP ${status})`;
}

async function recordFailure(base44, invoice, invoiceId, userId, message, duration, httpStatus = 502, apiData = {}, payloadSummary = {}) {
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
    request_summary: JSON.stringify(payloadSummary),
    response_summary: JSON.stringify(apiData).slice(0, 500),
    duration_ms: duration,
    error_message: message,
    triggered_by: userId
  });
}