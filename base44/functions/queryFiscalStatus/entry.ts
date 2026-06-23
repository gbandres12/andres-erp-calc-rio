// queryFiscalStatus - Consulta status de uma nota no Focus NFe
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { invoice_id } = await req.json();
    const invoice = await base44.entities.FiscalInvoice.get(invoice_id);
    if (!invoice) return Response.json({ error: 'Nota não encontrada' }, { status: 404 });

    if (!invoice.api_reference) {
      return Response.json({ error: 'Nota ainda não enviada para o Focus NFe' }, { status: 400 });
    }

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id: invoice.company_id });
    const config = configs[0];
    if (!config?.api_token) return Response.json({ error: 'Token da API não configurado' }, { status: 400 });

    const baseUrl = config.environment === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/v2/nfe/${invoice.api_reference}?completo=1`, {
      headers: { 'Authorization': `Basic ${btoa(config.api_token + ':')}` },
      signal: AbortSignal.timeout(15000)
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    let updateData = { api_status: data.status, last_status_check: new Date().toISOString() };
    let newStatus = invoice.status;

    if (response.status === 200) {
      if (data.status === 'autorizado') {
        newStatus = 'autorizada';
        updateData.api_access_key = data.chave_nfe;
        updateData.api_protocol = data.protocolo;
        updateData.xml_url = data.caminho_xml_nota_fiscal;
        updateData.pdf_url = data.caminho_danfe;
      } else if (data.status === 'cancelado') {
        newStatus = 'cancelada';
      } else if (data.status === 'erro') {
        newStatus = 'erro_integracao';
        updateData.error_message = data.erros?.[0]?.mensagem || 'Erro desconhecido';
        updateData.error_code = data.erros?.[0]?.codigo;
      }
    }

    updateData.status = newStatus;
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice_id, updateData);

    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id, company_id: invoice.company_id,
      event_type: 'consulta_status', status: response.status === 200 ? 'sucesso' : 'erro',
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