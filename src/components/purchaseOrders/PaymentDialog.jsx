import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/components/utils/formatters";

export default function PaymentDialog({ order, accounts, open, onClose, payments = [] }) {
  const queryClient = useQueryClient();
  const companyId = localStorage.getItem("selectedCompanyId");

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = (order?.total_amount || 0) - totalPaid;

  const [formData, setFormData] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    account_id: "",
    payment_method: "pix",
    notes: "",
  });

  const paymentMutation = useMutation({
    mutationFn: async (data) => {
      const account = accounts.find(a => a.id === data.account_id);
      const amount = parseFloat(data.amount);

      if (amount > remaining + 0.01) {
        throw new Error(`Valor (${formatCurrency(amount)}) supera o saldo devedor (${formatCurrency(remaining)})`);
      }

      // Criar pagamento parcial
      await base44.entities.PurchaseOrderPayment.create({
        ...data,
        amount,
        purchase_order_id: order.id,
        purchase_order_reference: order.reference,
        account_name: account?.name || "",
        company_id: companyId,
      });

      // Criar lançamento financeiro (despesa paga)
      await base44.entities.Transaction.create({
        description: `Pgto parcial ${order.reference} - ${order.item_name}`,
        amount,
        original_amount: amount,
        type: "despesa",
        category: "Compras de Insumos",
        status: "pago",
        due_date: data.payment_date,
        payment_date: data.payment_date,
        account_id: data.account_id,
        contact_id: order.supplier_id,
        contact_name: order.supplier_name,
        company_id: companyId,
        paid_amount: amount,
        notes: `Pagamento parcial do pedido ${order.reference}`,
      });

      // Atualizar saldo da conta
      if (account) {
        await base44.entities.FinancialAccount.update(account.id, {
          current_balance: (account.current_balance || 0) - amount,
        });
      }

      // Verificar se quitou tudo e atualizar status
      const newTotalPaid = totalPaid + amount;
      if (newTotalPaid >= order.total_amount - 0.01) {
        await base44.entities.PurchaseOrder.update(order.id, { status: "recebido" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["purchaseOrders"]);
      queryClient.invalidateQueries(["purchaseOrderPayments"]);
      queryClient.invalidateQueries(["transactions"]);
      queryClient.invalidateQueries(["financialAccounts"]);
      toast.success("Pagamento registrado com sucesso!");
      setFormData({ amount: "", payment_date: new Date().toISOString().split("T")[0], account_id: "", payment_method: "pix", notes: "" });
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.amount || !formData.account_id) {
      toast.error("Preencha o valor e a conta");
      return;
    }
    paymentMutation.mutate(formData);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento — {order.reference}</DialogTitle>
        </DialogHeader>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Total do Pedido</p>
            <p className="font-bold text-slate-800">{formatCurrency(order.total_amount)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Já Pago</p>
            <p className="font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Saldo Devedor</p>
            <p className="font-bold text-red-700">{formatCurrency(remaining)}</p>
          </div>
        </div>

        {/* Histórico de pagamentos */}
        {payments.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pagamentos Realizados</p>
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between items-center text-sm bg-slate-50 rounded px-3 py-2">
                  <div>
                    <span className="font-medium">{formatCurrency(p.amount)}</span>
                    <span className="text-slate-500 ml-2">{p.payment_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{p.payment_method}</Badge>
                    <span className="text-xs text-slate-400">{p.account_name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {remaining > 0.01 ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor a Pagar *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remaining}
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder={`Máx: ${formatCurrency(remaining)}`}
                />
              </div>
              <div className="space-y-2">
                <Label>Data do Pagamento *</Label>
                <Input
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Conta *</Label>
                <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? "Registrando..." : "Registrar Pagamento"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="text-center py-4">
            <p className="text-green-600 font-semibold">✅ Pedido totalmente quitado!</p>
            <Button variant="outline" className="mt-3" onClick={onClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}