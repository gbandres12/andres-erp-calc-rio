// emitFiscalInvoice - Emite nota fiscal via Focus NFe
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id } = await req.json();
    if (!invoice_id) return Response.json({ error: 'invoice_id obrigatório' }, { status: 400 });

    // Busca a nota
    const invoice = await base44.entities.FiscalInvoice.get(invoice_id);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });

    // Verifica status
    if (!['rascunho', 'pendente_envio', 'rejeitada', 'erro_integracao'].includes(invoice.status)) {
      return Response.json({ error: `Nota não pode ser emitida com status: ${invoice.status}` }, { status: 400 });
    }

    // Busca configuração fiscal
    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    if (!config) return Response.json({ error: 'Configuração fiscal não encontrada para esta empresa' }, { status: 400 });
    if (!config.api_token) return Response.json({ error: 'Token da API Focus NFe não configurado. Acesse Configurações Fiscais.' }, { status: 400 });

    // Verifica duplicidade por idempotency_key
    if (invoice.idempotency_key) {
      const existing = await base44.asServiceRole.entities.FiscalInvoice.filter({ idempotency_key: invoice.idempotency_key });
      const alreadyEmitted = existing.find(n => n.id !== invoice_id && ['enviada','processando','autorizada'].includes(n.status));
      if (alreadyEmitted) {
        return Response.json({ error: `Nota já emitida com esta chave: ${alreadyEmitted.reference}` }, { status: 409 });
      }
    }

    // Atualiza status para enviando
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, { status: 'enviada' });

    // Monta referência externa para o Focus NFe (única por empresa)
    const apiReference = invoice.api_reference || `${invoice.company_id.slice(-8)}-${invoice.reference}`;
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, { api_reference: apiReference });

    // Monta payload Focus NFe
    const payload = buildFocusNFePayload(invoice, config);

    // URL base Focus NFe
    const baseUrl = config.environment === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    const endpoint = `${baseUrl}/v2/nfe?ref=${apiReference}`;

    const startTime = Date.now();
    let apiResponse, apiData;

    try {
      apiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(config.api_token + ':')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      apiData = await apiResponse.json();
    } catch (fetchError) {
      // Erro de comunicação
      await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, {
        status: 'erro_integracao',
        error_message: fetchError.message,
        retry_count: (invoice.retry_count || 0) + 1
      });
      await base44.asServiceRole.entities.FiscalEvent.create({
        invoice_id, company_id: invoice.company_id,
        event_type: 'emissao', status: 'erro',
        error_message: fetchError.message,
        duration_ms: Date.now() - startTime,
        triggered_by: user.id
      });
      return Response.json({ error: 'Erro de comunicação com Focus NFe', details: fetchError.message }, { status: 502 });
    }

    const duration = Date.now() - startTime;
    const httpStatus = apiResponse.status;

    // Processa resposta
    let newStatus = 'processando';
    let updateData = { api_status: apiData.status, last_status_check: new Date().toISOString() };
    let eventStatus = 'sucesso';
    let errorMsg = null;

    if (httpStatus === 200 || httpStatus === 201) {
      if (apiData.status === 'autorizado') {
        newStatus = 'autorizada';
        updateData.api_access_key = apiData.chave_nfe;
        updateData.api_protocol = apiData.protocolo;
        updateData.xml_url = apiData.caminho_xml_nota_fiscal;
        updateData.pdf_url = apiData.caminho_danfe;
      } else if (apiData.status === 'processando_autorizacao' || apiData.status === 'pendente') {
        newStatus = 'processando';
      } else if (apiData.status === 'erro') {
        newStatus = 'erro_integracao';
        errorMsg = apiData.erros?.[0]?.mensagem || apiData.mensagem_sefaz || 'Erro desconhecido';
        updateData.error_message = errorMsg;
        updateData.error_code = apiData.erros?.[0]?.codigo || apiData.codigo_mensagem_sefaz;
        updateData.retry_count = (invoice.retry_count || 0) + 1;
        eventStatus = 'erro';
      }
    } else if (httpStatus === 422) {
      newStatus = 'rejeitada';
      errorMsg = apiData.erros?.[0]?.mensagem || apiData.mensagem || 'Dados inválidos';
      updateData.error_message = errorMsg;
      updateData.error_code = String(httpStatus);
      eventStatus = 'erro';
    } else {
      newStatus = 'erro_integracao';
      errorMsg = apiData.mensagem || `HTTP ${httpStatus}`;
      updateData.error_message = errorMsg;
      updateData.retry_count = (invoice.retry_count || 0) + 1;
      eventStatus = 'erro';
    }

    updateData.status = newStatus;
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, updateData);

    // Registra evento
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id, company_id: invoice.company_id,
      event_type: 'emissao', status: eventStatus,
      http_status: httpStatus,
      response_summary: JSON.stringify(apiData).slice(0, 500),
      duration_ms: duration,
      error_message: errorMsg,
      triggered_by: user.id
    });

    return Response.json({ success: true, status: newStatus, data: updateData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildFocusNFePayload(invoice, config) {
  return {
    natureza_operacao: invoice.nature_operation || 'Venda de mercadoria',
    forma_pagamento: 0,
    modal: 1,
    tipo_documento: 1,
    local_destino: 1,
    codigo_municipio_ocorrencia: '',
    formato_impressao_danfe: 1,
    tipo_emissao: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,

    // Emitente
    cnpj_emitente: config.cnpj?.replace(/\D/g, ''),
    nome_emitente: config.razao_social,
    nome_fantasia_emitente: config.nome_fantasia || config.razao_social,
    logradouro_emitente: config.logradouro || '',
    numero_emitente: config.numero || 'S/N',
    bairro_emitente: config.bairro || '',
    municipio_emitente: config.municipio || '',
    uf_emitente: config.uf || '',
    cep_emitente: config.cep?.replace(/\D/g, '') || '',
    inscricao_estadual_emitente: config.inscricao_estadual || '',
    regime_tributario_emitente: config.crt || 1,

    // Destinatário
    [invoice.recipient_cpf_cnpj?.replace(/\D/g, '').length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario']:
      invoice.recipient_cpf_cnpj?.replace(/\D/g, ''),
    nome_destinatario: invoice.recipient_name,
    email_destinatario: invoice.recipient_email || '',
    logradouro_destinatario: invoice.recipient_address?.logradouro || '',
    numero_destinatario: invoice.recipient_address?.numero || 'S/N',
    bairro_destinatario: invoice.recipient_address?.bairro || '',
    municipio_destinatario: invoice.recipient_address?.municipio || '',
    uf_destinatario: invoice.recipient_address?.uf || '',
    cep_destinatario: invoice.recipient_address?.cep?.replace(/\D/g, '') || '',
    indicador_inscricao_estadual_destinatario: invoice.recipient_ie ? 1 : 9,
    inscricao_estadual_destinatario: invoice.recipient_ie || '',

    // Itens
    items: (invoice.items || []).map((item, idx) => ({
      numero_item: idx + 1,
      codigo_produto: item.product_code || String(idx + 1),
      descricao: item.product_name,
      codigo_ncm: item.ncm?.replace(/\D/g, '') || '00000000',
      cfop: item.cfop || '5102',
      unidade_comercial: item.unit || 'UN',
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: item.unit_price,
      valor_bruto: item.total,
      unidade_tributavel: item.unit || 'UN',
      quantidade_tributavel: item.quantity,
      valor_unitario_tributavel: item.unit_price,
      valor_desconto: item.discount || 0,
      inclui_no_total: 1,
      icms_origem: 0,
      icms_cst: item.icms_cst || (config.crt === 1 ? '500' : '40'),
      pis_cst: item.pis_cst || '07',
      cofins_cst: item.cofins_cst || '07'
    })),

    // Totais
    icms_base_calculo: invoice.icms_total || 0,
    icms_valor_total: invoice.icms_total || 0,
    pis_valor_total: invoice.pis_total || 0,
    cofins_valor_total: invoice.cofins_total || 0,
    valor_produtos: invoice.subtotal || invoice.total,
    valor_desconto: invoice.discount_total || 0,
    valor_frete: invoice.shipping || 0,
    valor_total: invoice.total,

    // Pagamento
    formas_pagamento: [{
      forma_pagamento: invoice.payment_method || '99',
      valor_pagamento: invoice.total
    }]
  };
}