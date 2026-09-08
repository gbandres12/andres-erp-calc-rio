// downloadFiscalDocument - Baixa XML/DANFE da NotaAs com a chave de API
// (os links diretos salvos em xml_url/pdf_url exigem header x-api-key e
// falham com "erro de API" quando abertos direto no navegador)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id, doc } = await req.json();
    if (!invoice_id) return Response.json({ error: 'invoice_id obrigatório' }, { status: 400 });
    const type = doc === 'danfe' ? 'danfe' : 'xml';

    const invoice = await base44.entities.FiscalInvoice.get(invoice_id);
    if (!invoice || !invoice.api_reference) {
      return Response.json({ error: 'Nota ainda não enviada para a NotaAs' }, { status: 400 });
    }

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    const secretName = config?.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs desta empresa não configurada (segredo ${secretName})` }, { status: 500 });

    const started = Date.now();
    const response = await fetch(`https://platform.notaas.com.br/api/v1/nfe/invoices/${invoice.api_reference}/${type}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const message = `NotaAs recusou o download (HTTP ${response.status}): ${text.slice(0, 200)}`;
      await base44.asServiceRole.entities.FiscalEvent.create({
        invoice_id, company_id: invoice.company_id,
        event_type: type === 'xml' ? 'download_xml' : 'download_pdf',
        status: 'erro', http_status: response.status,
        error_message: message,
        duration_ms: Date.now() - started,
        triggered_by: user.id
      }).catch(() => {});
      return Response.json({ error: message }, { status: 502 });
    }

    // Base64 para atravessar o invoke do SDK sem corromper binário
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buffer.length; i += chunk) {
      binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
    }

    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id, company_id: invoice.company_id,
      event_type: type === 'xml' ? 'download_xml' : 'download_pdf',
      status: 'sucesso', http_status: response.status,
      duration_ms: Date.now() - started,
      triggered_by: user.id
    }).catch(() => {});

    const access = String(invoice.api_access_key || invoice.reference || invoice.id);
    return Response.json({
      success: true,
      filename: type === 'xml' ? `${access}.xml` : `DANFE-${access}.pdf`,
      content_type: type === 'xml' ? 'application/xml' : 'application/pdf',
      data: btoa(binary)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});