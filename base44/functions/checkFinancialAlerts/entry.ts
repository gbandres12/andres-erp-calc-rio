import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatBRL = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';

    const users = await base44.asServiceRole.entities.User.list();
    const alertUsers = users.filter(u => u.alert_settings?.alerts_enabled && u.email);

    if (alertUsers.length === 0) {
      return Response.json({ status: 'success', message: 'Nenhum usuário com alertas configurados', alertsSent: 0 });
    }

    const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
    let alertsSent = 0;

    for (const alertUser of alertUsers) {
      const settings = alertUser.alert_settings;
      const daysBefore = parseInt(settings.days_before_due) || 3;
      const payableThreshold = parseFloat(settings.payable_threshold) || 0;
      const receivableThreshold = parseFloat(settings.receivable_threshold) || 0;

      const alertDate = new Date(today);
      alertDate.setDate(alertDate.getDate() + daysBefore);

      let emailSections = [];

      for (const company of companies) {
        const transactions = await base44.asServiceRole.entities.Transaction.filter({ company_id: company.id });
        const pending = transactions.filter(t => t.status !== 'pago');

        const overdue = pending.filter(t => {
          if (!t.due_date) return false;
          const due = new Date(t.due_date + 'T00:00:00');
          return due < today;
        });

        const dueSoon = pending.filter(t => {
          if (!t.due_date) return false;
          const due = new Date(t.due_date + 'T00:00:00');
          return due >= today && due <= alertDate;
        });

        const totalPayableDueSoon = dueSoon
          .filter(t => t.type === 'despesa')
          .reduce((s, t) => s + (t.amount - (t.paid_amount || 0) - (t.discount || 0)), 0);

        const totalReceivableDueSoon = dueSoon
          .filter(t => t.type === 'receita')
          .reduce((s, t) => s + (t.amount - (t.paid_amount || 0) - (t.discount || 0)), 0);

        const totalOverdue = overdue.reduce((s, t) => s + (t.amount - (t.paid_amount || 0) - (t.discount || 0)), 0);

        const hasPayableAlert = payableThreshold > 0 ? totalPayableDueSoon >= payableThreshold : dueSoon.filter(t => t.type === 'despesa').length > 0;
        const hasReceivableAlert = receivableThreshold > 0 ? totalReceivableDueSoon >= receivableThreshold : false;
        const hasOverdue = overdue.length > 0;

        if (!hasOverdue && !hasPayableAlert && !hasReceivableAlert) continue;

        let section = `<div style="margin-bottom:20px;padding:16px;border-left:4px solid #3b82f6;background:#f8fafc">`;
        section += `<h3 style="margin:0 0 12px;color:#1e40af">${company.name}</h3>`;

        if (hasOverdue) {
          const overdueItems = overdue.slice(0, 5).map(t =>
            `<li style="margin:4px 0">${t.description} — <strong>${formatBRL(t.amount - (t.paid_amount||0))}</strong> — Venc: ${formatDate(t.due_date)}</li>`
          ).join('');
          section += `<p style="color:#dc2626;margin:8px 0">⚠️ <strong>${overdue.length} lançamento(s) em atraso — ${formatBRL(totalOverdue)}</strong></p>`;
          section += `<ul style="margin:4px 0;padding-left:20px;font-size:13px">${overdueItems}${overdue.length > 5 ? `<li>... e mais ${overdue.length - 5}</li>` : ''}</ul>`;
        }

        if (dueSoon.length > 0) {
          section += `<p style="color:#d97706;margin:8px 0">📅 <strong>${dueSoon.length} vencimento(s) nos próximos ${daysBefore} dia(s)</strong></p>`;
          if (totalPayableDueSoon > 0) section += `<p style="margin:4px 0">💸 A Pagar: <strong>${formatBRL(totalPayableDueSoon)}</strong></p>`;
          if (totalReceivableDueSoon > 0) section += `<p style="margin:4px 0">💰 A Receber: <strong>${formatBRL(totalReceivableDueSoon)}</strong></p>`;
        }

        section += `</div>`;
        emailSections.push(section);
      }

      if (emailSections.length === 0) continue;

      const body = `<html><body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
        <div style="background:#1e40af;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">📊 Alerta Financeiro — ${new Date().toLocaleDateString('pt-BR')}</h2>
        </div>
        <div style="padding:20px;background:white">
          <p>Olá <strong>${alertUser.full_name || alertUser.email}</strong>,</p>
          <p>Aqui está o resumo dos alertas financeiros de hoje:</p>
          ${emailSections.join('')}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
          <p style="font-size:12px;color:#94a3b8">Configure seus alertas em <strong>Configurações → Alertas Financeiros</strong>.</p>
        </div>
      </body></html>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: alertUser.email,
        subject: `📊 Alerta Financeiro — ${new Date().toLocaleDateString('pt-BR')}`,
        body
      });

      alertsSent++;
      console.log(`[Alertas] Email enviado para ${alertUser.email}`);
    }

    return Response.json({ status: 'success', alertsSent });
  } catch (error) {
    console.error('[Alertas] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});