// Converte um peso líquido em kg para a unidade do item da venda
export function kgToUnit(netKg, unit) {
  const u = (unit || "TON").toUpperCase();
  if (u === "KG") return Number(netKg);
  // TON e demais unidades (SACA, L, etc.) assumem toneladas
  return Number(netKg) / 1000;
}

// Registra uma retirada de item de venda: cria o registro de retirada,
// dá baixa em quantity_withdrawn e atualiza withdrawal_status.
// `quantity` já está na unidade do item; `quantityKg` (pesagem) é convertido.
export async function applyWithdrawal(base44, {
  saleId, productId, productName, quantity, quantityKg, unit,
  withdrawalDate, responsible, vehiclePlate, notes, weighingId
}) {
  let sale = null;
  try { sale = await base44.entities.Sale.get(saleId); } catch (_) {}
  if (!sale) throw new Error("Venda não encontrada");
  const items = [...(sale.items || [])];

  // Prioriza o item indicado; senão o primeiro com saldo pendente
  let idx = items.findIndex(i =>
    (productId && i.product_id === productId) ||
    (!productId && productName && i.product_name === productName)
  );
  if (idx === -1) idx = items.findIndex(i => ((i.quantity || 0) - (i.quantity_withdrawn || 0)) > 0.001);
  if (idx === -1) throw new Error("Não há saldo pendente de retirada nesta venda");

  const item = items[idx];
  const pending = (item.quantity || 0) - (item.quantity_withdrawn || 0);
  const targetUnit = unit || item.unit || "TON";
  const qty = quantity != null ? Number(quantity) : kgToUnit(quantityKg, targetUnit);
  if (!(qty > 0)) throw new Error("Quantidade a retirar deve ser maior que zero");

  const applied = Math.min(qty, pending);
  items[idx] = { ...item, quantity_withdrawn: (item.quantity_withdrawn || 0) + applied };

  const totalPending = items.reduce((s, i) => s + Math.max(0, (i.quantity || 0) - (i.quantity_withdrawn || 0)), 0);
  const anyWithdrawn = items.some(i => (i.quantity_withdrawn || 0) > 0);
  const withdrawal_status = totalPending <= 0.001 ? "total" : (anyWithdrawn ? "parcial" : "aguardando");

  await base44.entities.SaleWithdrawal.create({
    sale_id: sale.id,
    sale_reference: sale.reference,
    product_id: item.product_id || "",
    product_name: item.product_name || "",
    quantity: applied,
    unit: targetUnit,
    weighing_id: weighingId,
    withdrawal_date: withdrawalDate || new Date().toISOString(),
    responsible: responsible || "",
    vehicle_plate: vehiclePlate || "",
    notes: notes || "",
    company_id: sale.company_id
  });

  await base44.entities.Sale.update(sale.id, { items, withdrawal_status });
  return { applied, pendingAfter: totalPending, withdrawal_status, saleRef: sale.reference };
}