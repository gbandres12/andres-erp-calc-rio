// queryFiscalStatus - Consulta status de uma nota na NotaAs
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id } = await req.json();
    const invoice = await base44.entities.FiscalInvoice.get(invoice_id);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });
    if (!invoice.api_reference) {
      return Response.json({ error: 'Nota ainda não enviada para a NotaAs' }, { status: 400 });
    }

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    const secretName = config?.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs desta empresa não configurada (segredo ${secretName})` }, { status: 500 });

    const startTime = Date.now();
    const response = await fetch(`https://platform.notaas.com.br/api/v1/nfe/invoices/${invoice.api_reference}/status`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { message: text || `HTTP ${response.status}` }; }
    const duration = Date.now() - startTime;

    const updateData = { api_status: data.status || '', last_status_check: new Date().toISOString() };
    let newStatus = invoice.status;

    if (response.ok) {
      const status = String(data.status || '').toLowerCase();
      if (data.chaveAcesso) updateData.api_access_key = data.chaveAcesso;
      if (data.nProt) updateData.api_protocol = data.nProt;
      if (data.nNf) updateData.number = Number(data.nNf);
      if (data.serie) updateData.serie = String(data.serie);
      if (data.xmlUrl) updateData.xml_url = data.xmlUrl;
      if (data.pdfUrl || data.danfeUrl) updateData.pdf_url = data.pdfUrl || data.danfeUrl;
      if (status === 'issued' || status === 'authorized') {
        newStatus = 'autorizada';
      } else if (status.includes('cancel')) {
        newStatus = 'cancelada';
      } else if (status === 'rejected') {
        newStatus = 'rejeitada';
        updateData.error_message = data.motivo || data.message || 'Nota rejeitada pela SEFAZ';
        updateData.error_code = String(data.cStat || '');
      } else if (status === 'error' || status === 'failed') {
        newStatus = 'erro_integracao';
        updateData.error_message = data.motivo || data.message || 'Erro na NotaAs';
      } else {
        newStatus = 'processando';
      }
    }

    updateData.status = newStatus;
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, updateData);
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id, company_id: invoice.company_id,
      event_type: 'consulta_status', status: response.ok ? 'sucesso' : 'erro',
      http_status: response.status,
      response_summary: JSON.stringify(data).slice(0, 300),
      duration_ms: duration,
      triggered_by: user.id
    });

    return Response.json({ success: true, status: newStatus, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});