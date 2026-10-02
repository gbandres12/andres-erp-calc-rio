import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import LinkSelector from "@/components/transactions/LinkSelector";
import { formatBRL, getTodayDate } from "@/components/utils/formatters";

export default function PaymentStatusSection({ formData, setFormData, accounts, transactions, isEditing }) {
  const isPaid = formData.status === "pago";
  const isIncome = formData.type === "receita";
  const setStatus = (status) => setFormData(prev => ({
    ...prev, status,
    ...(status !== "pago" ? { link_sale_id: "", link_transaction_id: "" } : {}), payment_date: status === "pago" ? (prev.payment_date || getTodayDate()) : prev.payment_date
  }));
  const btn = (active, color) => cn("flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm transition-all",
    active ? color : "border-slate-200 text-slate-500 hover:border-slate-300");

  return (
    <div className="space-y-4 rounded-lg border-2 border-slate-200 p-4">
      <Label>Situação *</Label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setStatus("pago")} className={btn(isPaid, "border-green-500 bg-green-50 text-green-700")}>
          <CheckCircle2 className="w-4 h-4" /> {isIncome ? "Já recebido" : "Já pago"}
        </button>
        <button type="button" onClick={() => setStatus(formData.status === "pago" ? "pendente" : formData.status)} className={btn(!isPaid, "border-amber-500 bg-amber-50 text-amber-700")}>
          <Clock className="w-4 h-4" /> {isIncome ? "A receber" : "A pagar"}
        </button>
      </div>

      {isPaid && !isEditing && <LinkSelector formData={formData} setFormData={setFormData} transactions={transactions} />}

      {isPaid ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{isIncome ? "Data do recebimento *" : "Data do pagamento *"}</Label>
            <Input type="date" required value={formData.payment_date}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Conta *</Label>
            <Select required value={formData.account_id} onValueChange={(v) => setFormData(prev => ({ ...prev, account_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({formatBRL(a.current_balance)})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Vencimento *</Label>
          <Input type="date" required value={formData.due_date}
            onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))} />
          <p className="text-xs text-slate-500">
            {formData.status === "parcial" ? "Lançamento parcialmente quitado. " : ""}
            A baixa é feita depois, em {isIncome ? "Contas a Receber" : "Contas a Pagar"}.
          </p>
        </div>
      )}
    </div>
  );
}