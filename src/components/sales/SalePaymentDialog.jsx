import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Printer, Receipt, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";
import PaymentReceipt from "@/components/receipts/PaymentReceipt";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const getTodayDate = () => new Date().toISOString().split("T")[0];

const PAYMENT_METHODS = [
  { value: "dinheiro", label: "💵 Dinheiro" },
  { value: "pix", label: "📱 PIX" },
  { value: "cartao_credito", label: "💳 Cartão Crédito" },
  { value: "cartao_debito", label: "💳 Cartão Débito" },
  { value: "transferencia", label: "🏦 Transferência" },
  { value: "cheque", label: "📝 Cheque" },
];

export default function SalePaymentDialog({ sale, accounts, company, open, onClose, onSuccess }) {
  const [payments, setPayments] = useState([
    { description: "Pagamento", amount: "", date: getTodayDate(), account_id: "", payment_method: "pix" }
  ]);
  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState(null); // { payment, sale, previousPayments }

  if (!sale) return null;

  const alreadyPaid = sale.paid_amount || 0;
  const saleTotal = sale.total || 0;
  const remaining = saleTotal - alreadyPaid;
  const totalThisPayment = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const newRemaining = remaining - totalThisPayment;

  const addPayment = () =>
    setPayments([...payments, { description: `Pagamento ${payments.length + 1}`, amount: "", date: getTodayDate(), account_id: "", payment_method: "pix" }]);

  const removePayment = (idx) =>
    setPayments(payments.filter((_, i) => i !== idx));

  const updatePayment = (idx, field, value) => {
    const updated = [...payments];
    updated[idx][field] = value;
    setPayments(updated);
  };

  const fillTotal = () => {
    if (payments.length === 1) {
      updatePayment(0, "amount", remaining.toFixed(2));
    }
  };

  const handleSave = async () => {
    if (totalThisPayment <= 0) {
      toast.error("Informe pelo menos um valor de pagamento.");
      return;
    }
    if (payments.some(p => !p.account_id)) {
      toast.error("Selecione a conta para todos os pagamentos.");
      return;
    }

    setSaving(true);
    try {
      const createdPayments = [];
      for (const p of payments) {
        const amt = parseFloat(p.amount) || 0;
        if (amt <= 0) continue;

        // Criar pagamento
        const salePayment = await base44.entities.SalePayment.create({
          sale_id: sale.id,
          sale_reference: sale.reference,
          payment_method: p.payment_method,
          amount: amt,
          payment_date: p.date,
          account_id: p.account_id,
          company_id: sale.company_id,
          notes: p.description || ""
        });

        // Criar transação financeira
        await base44.entities.Transaction.create({
          description: `${sale.reference} - ${p.description || "Pagamento"} - ${sale.client_name}`,
          amount: amt,
          type: "receita",
          category: "Vendas",
          status: "pago",
          due_date: p.date,
          payment_date: p.date,
          account_id: p.account_id,
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: sale.company_id,
          paid_amount: amt,
          notes: `Venda: ${sale.reference}`
        });

        createdPayments.push({ ...salePayment, amount: amt, payment_date: p.date, payment_method: p.payment_method, notes: p.description });
      }

      // Atualizar venda
      const newPaid = alreadyPaid + totalThisPayment;
      const newRem = Math.max(0, saleTotal - newPaid);
      let paymentStatus = "parcial";
      if (newRem <= 0.01) paymentStatus = "pago";
      else if (newPaid === 0) paymentStatus = "pendente";

      await base44.entities.Sale.update(sale.id, {
        paid_amount: newPaid,
        remaining_amount: newRem,
        payment_status: paymentStatus,
        status: newRem <= 0.01 ? "concluida" : sale.status
      });

      await base44.functions.invoke("recalculateBalance", { company_id: sale.company_id });

      toast.success("✅ Pagamento registrado com sucesso!");
      onSuccess();
      onClose();
    } catch (e) {
      toast.error("Erro ao registrar pagamento: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleShowReceipt = (paymentIdx) => {
    const p = payments[paymentIdx];
    const amt = parseFloat(p.amount) || 0;
    setReceiptData({
      payment: {
        amount: amt,
        payment_date: p.date,
        payment_method: p.payment_method,
        notes: p.description
      },
      sale: {
        ...sale,
        company_name: company?.name || "",
        company_cnpj: company?.cnpj || ""
      },
      previousPayments: [{ amount: alreadyPaid }]
    });
  };

  if (receiptData) {
    return (
      <Dialog open={open} onOpenChange={() => { setReceiptData(null); onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recibo de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-2 no-print">
            <Button variant="outline" size="sm" onClick={() => setReceiptData(null)}>← Voltar</Button>
          </div>
          <PaymentReceipt
            payment={receiptData.payment}
            sale={receiptData.sale}
            previousPayments={receiptData.previousPayments}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-green-600" />
            Registrar Pagamento — {sale.reference}
          </DialogTitle>
        </DialogHeader>

        {/* Resumo da venda */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">{sale.client_name}</p>
                <p className="text-xs text-slate-500">{sale.reference}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-xs text-slate-500">Total: <span className="font-bold text-slate-700">{formatBRL(saleTotal)}</span></p>
                <p className="text-xs text-slate-500">Já pago: <span className="font-bold text-green-600">{formatBRL(alreadyPaid)}</span></p>
                <p className="text-xs text-slate-500">Saldo: <span className="font-bold text-orange-600">{formatBRL(remaining)}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-semibold">Pagamentos</Label>
            <div className="flex gap-2">
              {payments.length === 1 && (
                <Button type="button" size="sm" variant="outline" onClick={fillTotal} className="text-xs">
                  Quitar Total ({formatBRL(remaining)})
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={addPayment}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Parcela
              </Button>
            </div>
          </div>

          {payments.map((p, idx) => (
            <Card key={idx} className="border-slate-200">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={p.description}
                      onChange={e => updatePayment(idx, "description", e.target.value)}
                      placeholder="Ex: Entrada, 1ª parcela..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={p.amount}
                      onChange={e => updatePayment(idx, "amount", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={p.date}
                      onChange={e => updatePayment(idx, "date", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Forma</Label>
                    <Select value={p.payment_method} onValueChange={v => updatePayment(idx, "payment_method", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Conta</Label>
                    <div className="flex gap-2">
                      <Select value={p.account_id} onValueChange={v => updatePayment(idx, "account_id", v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name} ({formatBRL(a.current_balance)})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="border-green-300 text-green-600 hover:bg-green-50 shrink-0"
                        title="Pré-visualizar recibo"
                        onClick={() => handleShowReceipt(idx)}
                        disabled={!p.amount}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {payments.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => removePayment(idx)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Resumo do lançamento */}
        <Card className={newRemaining <= 0.01 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}>
          <CardContent className="pt-3 pb-3">
            <div className="flex justify-between text-sm">
              <span>Pagando agora:</span>
              <span className="font-bold text-blue-700">{formatBRL(totalThisPayment)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Saldo após pagamento:</span>
              <span className={`font-bold ${newRemaining <= 0.01 ? "text-green-700" : "text-orange-700"}`}>
                {formatBRL(Math.max(0, newRemaining))}
              </span>
            </div>
            {newRemaining <= 0.01 && (
              <div className="flex items-center gap-1 mt-2 text-green-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" /> Venda será quitada!
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || totalThisPayment <= 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? "Salvando..." : "Confirmar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}