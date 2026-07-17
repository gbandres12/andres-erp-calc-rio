// fiscalWebhook - Recebe e valida eventos de NF-e da NotaAs
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return Response.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const event = payload.event || req.headers.get('X-Notaas-Event');
    const data = payload.data || {};
    const supportedEvents = ['nfe.issued', 'nfe.error', 'nfe.cancelled'];
    if (!supportedEvents.includes(event)) {
      return Response.json({ ok: true, note: 'Teste recebido' });
    }

    const secret = Deno.env.get('NOTAAS_WEBHOOK_SECRET');
    const signature = req.headers.get('X-Notaas-Signature')?.trim().toLowerCase();

    if (!secret) {
      return Response.json({ error: 'Segredo do webhook indisponível' }, { status: 500 });
    }
    if (!signature) {
      return Response.json({ error: 'Assinatura ausente' }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expected = 'sha256=' + Array.from(new Uint8Array(signed))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    let difference = expected.length === signature.length ? 0 : 1;
    const comparisonLength = Math.min(expected.length, signature.length);
    for (let index = 0; index < comparisonLength; index += 1) {
      difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    if (difference !== 0) {
      return Response.json({ error: 'Assinatura inválida' }, { status: 401 });
    }

    const invoiceId = data.invoiceId;
    if (!invoiceId) {
      return Response.json({ ok: true, note: 'Evento de teste sem invoiceId' });
    }

    const invoices = await base44.asServiceRole.entities.FiscalInvoice.filter({
      api_reference: invoiceId
    });
    if (!invoices.length) {
      return Response.json({ ok: true, note: 'Nota não encontrada — evento ignorado' });
    }

    const invoice = invoices[0];
    const updateData = {
      api_status: event,
      last_status_check: new Date().toISOString()
    };

    if (data.chaveAcesso) updateData.api_access_key = data.chaveAcesso;
    if (data.nProt) updateData.api_protocol = data.nProt;

    if (event === 'nfe.issued') {
      updateData.status = 'autorizada';
      updateData.error_message = '';
      updateData.error_code = '';
    } else if (event === 'nfe.cancelled') {
      updateData.status = 'cancelada';
    } else {
      updateData.status = 'rejeitada';
      updateData.error_message = data.xMotivo || 'NF-e rejeitada pela SEFAZ';
      updateData.error_code = data.cStat ? String(data.cStat) : '';
    }

    await base44.asServiceRole.entities.FiscalInvoice.update(invoice.id, updateData);
    await base44.asServiceRole.entities.FiscalEvent.create({
      invoice_id: invoice.id,
      company_id: invoice.company_id,
      event_type: 'webhook_recebido',
      status: 'sucesso',
      response_summary: JSON.stringify({
        event,
        deliveryId: payload.deliveryId,
        invoiceId,
        cStat: data.cStat,
        xMotivo: data.xMotivo
      }).slice(0, 500),
      triggered_by: 'system'
    });

    return Response.json({ ok: true, status: updateData.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});