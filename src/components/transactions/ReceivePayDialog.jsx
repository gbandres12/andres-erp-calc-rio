import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";
import BranchBadge from "@/components/BranchBadge";

export default function ReceivePayDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  onSubmit,
  isSubmitting
}) {
  const [formData, setFormData] = useState({
    amount: 0,
    discount: 0,
    payment_date: "",
    account_id: "",
    payment_method: "dinheiro",
    cost_center: "",
    notes: ""
  });

  useEffect(() => {
    if (!open || !transaction) return;
    setFormData({
      amount: transaction.amount - (transaction.paid_amount || 0) - (transaction.discount || 0),
      discount: 0,
      payment_date: new Date().toISOString().split("T")[0],
      account_id: transaction.account_id || "",
      payment_method: "dinheiro",
      cost_center: transaction.cost_center || "",
      notes: ""
    });
  }, [open, transaction]);

  const handleRegister = () => {
    if (!transaction) return;
    if (formData.amount <= 0) return;
    if (!formData.account_id) return;
    onSubmit({
      id: transaction.id,
      amount: parseFloat(formData.amount),
      discount: parseFloat(formData.discount || 0),
      date: formData.payment_date,
      accountId: formData.account_id,
      paymentMethod: formData.payment_method,
      notes: formData.notes,
      costCenter: formData.cost_center
    });
  };

  if (!transaction) return null;
  const remaining = transaction.amount - (transaction.paid_amount || 0) - (transaction.discount || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {transaction.type === "receita" ? "💰 Receber" : "💸 Pagar"} - Abatimento
          </DialogTitle>
        </DialogHeader>
        <BranchBadge className="mb-2" />

        <div className="space-y-4">
          <Card className="bg-slate-50">
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Valor Total:</span>
                  <span className="font-bold">{formatBRL(transaction.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Já Pago:</span>
                  <span className="text-green-600 font-medium">{formatBRL(transaction.paid_amount || 0)}</span>
                </div>
                {(transaction.discount > 0) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Descontos:</span>
                    <span className="text-red-500 font-medium">{formatBRL(transaction.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-slate-600 font-medium">Saldo Restante:</span>
                  <span className="text-orange-600 font-bold text-lg">{formatBRL(remaining)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor a {transaction.type === "receita" ? "Receber" : "Pagar"} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value === "" ? "" : e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Desconto concedido</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.discount}
                  onChange={(e) => setFormData({ ...formData, discount: e.target.value === "" ? "" : e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 mb-2">
              Saldo Restante: {formatBRL(remaining)}
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Input
                type="date"
                required
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Conta *</Label>
              <Select
                required
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({formatBRL(account.current_balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Forma de Pagamento *</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                  <SelectItem value="pix">📱 PIX</SelectItem>
                  <SelectItem value="transferencia">🏦 Transferência</SelectItem>
                  <SelectItem value="cartao_debito">💳 Cartão Débito</SelectItem>
                  <SelectItem value="cartao_credito">💳 Cartão Crédito</SelectItem>
                  <SelectItem value="cheque">📝 Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Centro de Custo</Label>
              <Input
                value={formData.cost_center}
                onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
                placeholder="Ex: Administrativo, Frota, Obras, Vendas..."
              />
              <p className="text-xs text-slate-500">Informe o centro de custo onde este abatimento deve ser contabilizado.</p>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Ex: Referente à parcela 1/3"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegister}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {isSubmitting ? "Registrando..." : "Registrar Abatimento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}