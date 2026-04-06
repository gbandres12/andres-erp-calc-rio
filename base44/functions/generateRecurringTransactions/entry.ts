import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const recurring = await base44.asServiceRole.entities.RecurringTransaction.filter({ is_active: true });
    let created = 0;

    for (const rec of recurring) {
      let shouldGenerate = false;
      if (!rec.next_due_date) {
        shouldGenerate = true;
      } else {
        const nextDue = new Date(rec.next_due_date + 'T00:00:00');
        shouldGenerate = nextDue <= today;
      }

      if (!shouldGenerate) continue;

      await base44.asServiceRole.entities.Transaction.create({
        description: rec.description,
        amount: rec.amount,
        original_amount: rec.amount,
        discount_type: 'valor',
        discount_value: 0,
        type: rec.type,
        category: rec.category || '',
        status: 'pendente',
        due_date: todayStr,
        account_id: rec.account_id || '',
        contact_id: rec.contact_id || '',
        contact_name: rec.contact_name || '',
        company_id: rec.company_id,
        notes: `Gerado automaticamente - Recorrência ${rec.frequency}`
      });

      created++;

      // Calcular próximo vencimento
      const next = new Date(today);
      const freq = rec.frequency || 'mensal';
      if (freq === 'diaria') next.setDate(next.getDate() + 1);
      else if (freq === 'semanal') next.setDate(next.getDate() + 7);
      else if (freq === 'quinzenal') next.setDate(next.getDate() + 15);
      else if (freq === 'mensal') next.setMonth(next.getMonth() + 1);
      else if (freq === 'bimestral') next.setMonth(next.getMonth() + 2);
      else if (freq === 'trimestral') next.setMonth(next.getMonth() + 3);
      else if (freq === 'semestral') next.setMonth(next.getMonth() + 6);
      else if (freq === 'anual') next.setFullYear(next.getFullYear() + 1);
      else next.setMonth(next.getMonth() + 1);

      if (rec.day_of_month) {
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(rec.day_of_month, lastDay));
      }

      await base44.asServiceRole.entities.RecurringTransaction.update(rec.id, {
        last_generated_date: todayStr,
        next_due_date: next.toISOString().split('T')[0]
      });
    }

    console.log(`[Recorrentes] Gerados: ${created} de ${recurring.length} recorrências`);
    return Response.json({ status: 'success', created, processed: recurring.length });
  } catch (error) {
    console.error('[Recorrentes] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});