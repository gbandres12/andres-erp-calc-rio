// fiscalWebhook - Recebe callbacks do Focus NFe
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.text();
    let data;
    try { data = JSON.parse(body); } catch { return Response.json({ error: 'Payload inválido' }, { status: 400 }); }

    // Identifica nota pela referência externa
    const apiReference = data.ref || data.referencia;
    if (!apiReference) return Response.json({ error: 'Referência não informada' }, { status: 400 });

    const invoices = await base44.asServiceRole.entities.FiscalInvoice.filter({ api_reference: apiReference });
    if (!invoices.length) return Response.json({ ok: true, note: 'Nota não encontrada — ignorado' });

    const invoice = invoices[0];
    let updateData = { api_status: data.status, last_status_check: new Date().toISOString() };
    let newStatus = invoice.status;

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
      updateData.error_message = data.erros?.[0]?.mensagem || 'Erro via webhook';
      updateData.error_code = data.erros?.[0]?.codigo;
    }

    updateData.status = newStatus;
    await base44.asServiceRole.entities.FiscalInvoice.update(invoice.id, updateData);

    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id: invoice.id,
      company_id: invoice.company_id,
      event_type: 'webhook_recebido',
      status: 'sucesso',
      response_summary: JSON.stringify(data).slice(0, 500),
      triggered_by: 'system'
    });

    return Response.json({ ok: true, status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});