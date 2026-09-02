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

// Localiza a venda vinculada a um lançamento: prioriza a tag sale_id em notes;
// senão casa pela referência (VENDA-xxxxx) quando única na filial.
export async function findLinkedSale(base44, transaction, companyId) {
  const tag = (transaction.notes || "").match(/sale_id:([A-Za-z0-9_-]+)/);
  if (tag) {
    try {
      const s = await base44.entities.Sale.get(tag[1]);
      if (s) return s;
    } catch (_) {}
  }
  const ref = (transaction.description || "").match(/VENDA-\d+/);
  if (!ref) return null;
  const sales = await base44.entities.Sale.filter({ company_id: companyId, reference: ref[0] });
  return sales.length === 1 ? sales[0] : null;
}

// Quita as parcelas da venda conforme o valor já pago + abatimentos
// (cobertura sequencial: parcela 1, 2, 3... até acabar o orçamento).
export async function reconcileSaleInstallments(base44, saleId, paidTotal, paymentDate) {
  const installments = await base44.entities.SaleInstallment.filter({ sale_id: saleId });
  if (!installments.length) return;
  const sorted = [...installments].sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
  const today = paymentDate || new Date().toISOString().split("T")[0];
  let budget = Number(paidTotal || 0);
  for (const inst of sorted) {
    const amt = Number(inst.amount || 0);
    if (budget + 0.01 >= amt) {
      budget -= amt;
      if (inst.status !== "pago" || !inst.payment_date) {
        await base44.entities.SaleInstallment.update(inst.id, {
          status: "pago",
          paid_amount: amt,
          payment_date: inst.payment_date || today
        });
      }
    } else if (inst.status === "pago") {
      // Pagamento removido — reabre a parcela que não está mais coberta
      await base44.entities.SaleInstallment.update(inst.id, { status: "pendente", paid_amount: 0, payment_date: null });
    }
  }
}

// Espelha na venda o recebimento de um "Saldo a Receber" pago pelo financeiro:
// cria o pagamento da venda, atualiza o status dela e quita as parcelas cobertas.
// Retorna { saleId, saleRef } ou null quando o lançamento não é de venda.
export async function mirrorReceivingToSale(base44, { transaction, companyId, amount, discount = 0, date, accountId, paymentMethod = "dinheiro", notes = "" }) {
  if (!(transaction.description || "").includes("Saldo a Receber")) return null;
  const sale = await findLinkedSale(base44, transaction, companyId);
  if (!sale) return null;

  const openBalance = sale.remaining_amount ?? Math.max(0, (sale.total || 0) - (sale.paid_amount || 0) - (sale.discount || 0));
  const applyAmount = Math.min(Number(amount || 0), openBalance);
  if (applyAmount <= 0 && discount <= 0) return null;

  // Tag do ID da venda no lançamento: exclusão da venda apaga exatamente os lançamentos dela
  if (!(transaction.notes || "").includes(`sale_id:${sale.id}`)) {
    await base44.entities.Transaction.update(transaction.id, {
      notes: `${(transaction.notes || "").trim()} | sale_id:${sale.id}`.trim()
    });
  }

  await base44.entities.SalePayment.create({
    sale_id: sale.id,
    sale_reference: sale.reference,
    payment_method: paymentMethod,
    amount: applyAmount,
    discount: Number(discount || 0),
    payment_date: date,
    account_id: accountId,
    company_id: companyId,
    notes: notes || "Recebido via Contas a Receber"
  });

  const newPaid = (sale.paid_amount || 0) + applyAmount;
  const newDiscount = (sale.discount || 0) + Number(discount || 0);
  const newRem = Math.max(0, (sale.total || 0) - newPaid - newDiscount);
  const paymentStatus = newRem <= 0.01 ? "pago" : (newPaid > 0 ? "parcial" : "pendente");
  const updates = { paid_amount: newPaid, remaining_amount: newRem, payment_status: paymentStatus, discount: newDiscount };
  if (paymentStatus === "pago" && sale.status === "faturada") updates.status = "concluida";
  await base44.entities.Sale.update(sale.id, updates);
  await reconcileSaleInstallments(base44, sale.id, (sale.total || 0) - newRem, date);
  return { saleId: sale.id, saleRef: sale.reference, paymentStatus };
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