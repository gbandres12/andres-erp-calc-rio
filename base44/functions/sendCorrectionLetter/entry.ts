// sendCorrectionLetter - Envia Carta de Correção Eletrônica (CC-e) de NF-e na NotaAs
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id: invoiceId, correction } = await req.json();
    if (!invoiceId) return Response.json({ error: 'invoice_id obrigatório' }, { status: 400 });
    const text = String(correction || '').trim();
    if (text.length < 15 || text.length > 1000) {
      return Response.json({ error: 'O texto da correção deve ter entre 15 e 1000 caracteres (exigência SEFAZ)' }, { status: 400 });
    }

    const invoice = await base44.entities.FiscalInvoice.get(invoiceId);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });
    if (invoice.document_type !== 'nfe') {
      return Response.json({ error: 'Carta de Correção só é permitida para NF-e' }, { status: 400 });
    }
    if (invoice.status !== 'autorizada') {
      return Response.json({ error: 'Somente notas autorizadas podem receber Carta de Correção' }, { status: 400 });
    }
    if (!invoice.api_reference) {
      return Response.json({ error: 'Nota sem referência na NotaAs (importada do emissor antigo?). A CC-e deve ser emitida no emissor de origem.' }, { status: 400 });
    }

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    const secretName = config?.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs desta empresa não configurada (segredo ${secretName})` }, { status: 500 });

    const started = Date.now();
    const response = await fetch(`https://platform.notaas.com.br/api/v1/nfe/invoices/${invoice.api_reference}/correcao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ correcao: text }),
      signal: AbortSignal.timeout(30000)
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { message: raw || `HTTP ${response.status}` }; }
    const duration = Date.now() - started;

    if (!response.ok) {
      const message = data.message || data.motivo || data.error || `A NotaAs recusou a correção (HTTP ${response.status})`;
      await base44.asServiceRole.entities.FiscalEvent.create({
        invoice_id: invoiceId,
        company_id: invoice.company_id,
        event_type: 'carta_correcao',
        status: 'erro',
        http_status: response.status,
        response_summary: JSON.stringify(data).slice(0, 300),
        duration_ms: duration,
        error_message: message,
        triggered_by: user.id
      });
      return Response.json({ error: message }, { status: response.status });
    }

    await base44.asServiceRole.entities.FiscalInvoice.update(invoiceId, {
      correction_letter: text,
      correction_date: new Date().toISOString()
    });
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      event_type: 'carta_correcao',
      status: 'sucesso',
      http_status: response.status,
      request_summary: JSON.stringify({ caracteres: text.length }),
      response_summary: JSON.stringify(data).slice(0, 300),
      duration_ms: duration,
      triggered_by: user.id
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});