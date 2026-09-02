import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const KINDS = new Set(['sale_payment', 'transaction_payment', 'transaction', 'sale']);

async function assertPassword(svc, companyId, password) {
  if (!companyId || !password) {
    throw Object.assign(new Error('Filial e senha são obrigatórios'), { status: 400 });
  }
  const pwds = await svc.entities.DeletionPassword.filter({ company_id: companyId, is_active: true });
  if (!pwds.length) {
    throw Object.assign(new Error('Nenhuma senha de exclusão configurada nesta filial. Vá em Configurações → Segurança.'), { status: 400 });
  }
  if (String(password) !== String(pwds[0].password_hash)) {
    throw Object.assign(new Error('Senha incorreta'), { status: 401 });
  }
}

async function deleteTxCascade(svc, txId) {
  const tps = await svc.entities.TransactionPayment.filter({ transaction_id: txId });
  for (const tp of tps || []) {
    await svc.entities.TransactionPayment.delete(tp.id);
  }
  await svc.entities.Transaction.delete(txId);
}

function near(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.02;
}

async function deleteSalePayment(svc, paymentId) {
  const payment = await svc.entities.SalePayment.get(paymentId);
  if (!payment) throw Object.assign(new Error('Pagamento da venda não encontrado'), { status: 404 });

  const sale = await svc.entities.Sale.get(payment.sale_id);
  const companyId = payment.company_id || sale?.company_id;

  const txs = await svc.entities.Transaction.filter({ company_id: companyId, type: 'receita' }, undefined, 2000);
  const ref = sale?.reference || payment.sale_reference || '';
  const refIsUnique = await isRefUnique(svc, companyId, ref, payment.sale_id);
  const matches = (txs || []).filter((t) => {
    const blob = `${t.description || ''} ${t.notes || ''}`;
    const hasRef = ref && blob.includes(ref);
    const sameAmt = near(t.paid_amount || t.amount, payment.amount);
    const notesLink = (t.notes || '').includes(payment.id);
    const idTagged = payment.sale_id && blob.includes(`sale_id:${payment.sale_id}`);
    return notesLink || idTagged || (hasRef && sameAmt && refIsUnique);
  });
  for (const t of matches) {
    await deleteTxCascade(svc, t.id);
  }

  await svc.entities.SalePayment.delete(payment.id);

  if (sale) {
    const remainingPays = await svc.entities.SalePayment.filter({ sale_id: sale.id });
    const newPaid = (remainingPays || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const newDiscount = (remainingPays || []).reduce((s, p) => s + Number(p.discount || 0), 0);
    const newRem = Math.max(0, Number(sale.total || 0) - newPaid - newDiscount);
    let paymentStatus = 'pendente';
    if (newRem <= 0.01) paymentStatus = 'pago';
    else if (newPaid > 0.01) paymentStatus = 'parcial';
    let status = sale.status;
    if (newRem <= 0.01 && status !== 'cancelada') status = 'concluida';
    else if (status === 'concluida') status = 'faturada';
    await svc.entities.Sale.update(sale.id, {
      paid_amount: newPaid,
      remaining_amount: newRem,
      payment_status: paymentStatus,
      status,
      discount: newDiscount,
    });
  }

  if (companyId) await recalc(svc, companyId);
  return { kind: 'sale_payment', id: paymentId, company_id: companyId };
}

async function deleteTransactionPayment(svc, paymentId) {
  const payment = await svc.entities.TransactionPayment.get(paymentId);
  if (!payment) throw Object.assign(new Error('Pagamento não encontrado'), { status: 404 });
  const tx = await svc.entities.Transaction.get(payment.transaction_id);
  await svc.entities.TransactionPayment.delete(payment.id);
  if (tx) {
    const left = await svc.entities.TransactionPayment.filter({ transaction_id: tx.id });
    const newPaid = (left || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const newDiscount = (left || []).reduce((s, p) => s + Number(p.discount || 0), 0);
    const rem = Number(tx.amount || 0) - newPaid - newDiscount;
    let status = 'pendente';
    if (rem <= 0.01) status = 'pago';
    else if (newPaid > 0.01) status = 'parcial';
    await svc.entities.Transaction.update(tx.id, {
      paid_amount: newPaid,
      discount: newDiscount,
      status,
      payment_date: status === 'pago' ? (left?.[0]?.payment_date || tx.payment_date) : null,
    });
  }
  const companyId = payment.company_id || tx?.company_id;
  if (companyId) await recalc(svc, companyId);
  return { kind: 'transaction_payment', id: paymentId, company_id: companyId };
}

async function deleteTransaction(svc, id) {
  const tx = await svc.entities.Transaction.get(id);
  if (!tx) throw Object.assign(new Error('Lançamento não encontrado'), { status: 404 });
  await deleteTxCascade(svc, id);
  if (tx.company_id) await recalc(svc, tx.company_id);
  return { kind: 'transaction', id, company_id: tx.company_id };
}

// Referências de venda podem se duplicar (vendas históricas). Casar
// transações por texto da referência é inseguro nesse caso: apaga
// lançamentos financeiros de OUTRA venda com a mesma referência.
// Quando a referência não é única na filial, só apagamos lançamentos
// marcados com o ID desta venda (tag "sale_id:<id>" em notes).
async function isRefUnique(svc, companyId, ref, saleId) {
  if (!ref) return false;
  const salesWithRef = await svc.entities.Sale.filter({ company_id: companyId, reference: ref });
  return !(salesWithRef || []).some((s) => s.id !== saleId);
}

async function deleteSale(svc, id) {
  const sale = await svc.entities.Sale.get(id);
  if (!sale) throw Object.assign(new Error('Venda não encontrada'), { status: 404 });
  const companyId = sale.company_id;
  const ref = sale.reference || '';
  const refIsUnique = await isRefUnique(svc, companyId, ref, id);

  const txs = await svc.entities.Transaction.filter({ company_id: companyId }, undefined, 10000);
  for (const t of txs || []) {
    const blob = `${t.description || ''} ${t.notes || ''}`;
    const idTagged = blob.includes(`sale_id:${id}`);
    const refMatch = ref && blob.includes(ref);
    if (idTagged || (refMatch && refIsUnique)) await deleteTxCascade(svc, t.id);
  }

  const pays = await svc.entities.SalePayment.filter({ sale_id: id });
  for (const p of pays || []) await svc.entities.SalePayment.delete(p.id);

  const inst = await svc.entities.SaleInstallment.filter({ sale_id: id });
  for (const i of inst || []) await svc.entities.SaleInstallment.delete(i.id);

  await svc.entities.Sale.delete(id);
  if (companyId) await recalc(svc, companyId);
  return { kind: 'sale', id, company_id: companyId };
}

async function recalc(svc, companyId) {
  try {
    // saldo recalculado pelo próprio app; se a function não existir no client de service, ignora
    if (typeof svc.functions?.invoke === 'function') {
      await svc.functions.invoke('recalculateBalance', { company_id: companyId });
    }
  } catch (_) {}
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    if (!actor) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json();
    const kind = body?.kind;
    const id = body?.id;
    const password = body?.password;
    const companyId = body?.company_id;

    if (!KINDS.has(kind) || !id) {
      return Response.json({ error: 'kind e id são obrigatórios' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    await assertPassword(svc, companyId, password);

    let result;
    if (kind === 'sale_payment') result = await deleteSalePayment(svc, id);
    else if (kind === 'transaction_payment') result = await deleteTransactionPayment(svc, id);
    else if (kind === 'transaction') result = await deleteTransaction(svc, id);
    else result = await deleteSale(svc, id);

    try {
      await svc.entities.ActivityLog.create({
        user_email: actor.email,
        user_name: actor.full_name || actor.email,
        action: 'delete',
        entity_type: kind,
        entity_id: id,
        company_id: companyId || result.company_id,
        details: `Excluiu ${kind} ${id}`,
      });
    } catch (_) {}

    return Response.json({ success: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || 'Falha ao excluir' }, { status });
  }
});