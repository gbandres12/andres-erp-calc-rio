export async function deleteLinkedPayments(base44, transactionId) {
  const payments = await base44.entities.TransactionPayment.filter({ transaction_id: transactionId });
  for (const p of payments) {
    await base44.entities.TransactionPayment.delete(p.id);
  }
}

export async function createPaidTransaction(base44, payload, extras = {}) {
  // Tag do ID da venda em notes: permite que a exclusão da venda apague
  // apenas os lançamentos dela, mesmo quando há referências duplicadas.
  const saleTag = extras.sale_id ? ` | sale_id:${extras.sale_id}` : "";
  const tx = await base44.entities.Transaction.create({
    ...payload,
    notes: `${payload.notes || ""}${saleTag}`,
  });
  const amount = Number(payload.paid_amount || payload.amount || 0);
  if (payload.status === "pago" && payload.account_id && amount > 0) {
    await base44.entities.TransactionPayment.create({
      transaction_id: tx.id,
      transaction_reference: payload.description,
      amount,
      discount: payload.discount || 0,
      payment_date: payload.payment_date,
      account_id: payload.account_id,
      account_name: extras.account_name || "",
      payment_method: extras.payment_method || "dinheiro",
      notes: payload.notes || "",
      company_id: payload.company_id,
    });
  }
  return tx;
}

export async function deleteSaleFinancials(base44, sale) {
  const companyId = sale.company_id;
  const allTx = await base44.entities.Transaction.filter({ company_id: companyId }, undefined, 10000);
  const saleTx = allTx.filter(
    (t) => t.notes?.includes(sale.reference) || t.description?.includes(sale.reference)
  );
  for (const t of saleTx) {
    await deleteLinkedPayments(base44, t.id);
    await base44.entities.Transaction.delete(t.id);
  }

  const salePayments = await base44.entities.SalePayment.filter({ sale_id: sale.id });
  for (const p of salePayments) {
    await base44.entities.SalePayment.delete(p.id);
  }

  const installments = await base44.entities.SaleInstallment.filter({ sale_id: sale.id });
  for (const inst of installments) {
    await base44.entities.SaleInstallment.delete(inst.id);
  }

  if (companyId) {
    await base44.functions.invoke("recalculateBalance", { company_id: companyId });
  }
}