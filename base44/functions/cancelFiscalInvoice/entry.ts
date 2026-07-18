// cancelFiscalInvoice - Cancela nota fiscal na NotaAs
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id, reason } = await req.json();
    if (!invoice_id) return Response.json({ error: 'invoice_id obrigatório' }, { status: 400 });
    if (!reason || reason.trim().length < 15) {
      return Response.json({ error: 'Justificativa deve ter no mínimo 15 caracteres (exigência SEFAZ)' }, { status: 400 });
    }

    const invoice = await base44.entities.FiscalInvoice.get(invoice_id);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });
    if (invoice.status !== 'autorizada') {
      return Response.json({ error: 'Somente notas autorizadas podem ser canceladas' }, { status: 400 });
    }
    if (!invoice.api_reference) {
      return Response.json({ error: 'Nota sem referência na NotaAs (importada do emissor antigo?). Cancele no emissor de origem.' }, { status: 400 });
    }

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    const secretName = config?.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs desta empresa não configurada (segredo ${secretName})` }, { status: 500 });

    const startTime = Date.now();
    const response = await fetch(`https://platform.notaas.com.br/api/v1/nfe/invoices/${invoice.api_reference}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ justificativa: reason.trim() }),
      signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { message: text || `HTTP ${response.status}` }; }
    const duration = Date.now() - startTime;

    let newStatus = invoice.status;
    let eventStatus = 'sucesso';
    let errorMsg = null;

    if (response.ok && String(data.status || '').toLowerCase().includes('cancel')) {
      newStatus = 'cancelada';
      await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, {
        status: 'cancelada',
        cancel_reason: reason,
        cancel_date: new Date().toISOString()
      });
    } else {
      eventStatus = 'erro';
      errorMsg = data.message || data.motivo || data.error || `HTTP ${response.status}`;
    }

    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id, company_id: invoice.company_id,
      event_type: 'cancelamento', status: eventStatus,
      http_status: response.status,
      response_summary: JSON.stringify(data).slice(0, 300),
      duration_ms: duration,
      error_message: errorMsg,
      triggered_by: user.id
    });

    return Response.json({ success: newStatus === 'cancelada', status: newStatus, error: errorMsg });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});