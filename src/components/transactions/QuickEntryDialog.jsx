import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/components/utils/formatters";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/components/utils/categories";
import BranchBadge from "@/components/BranchBadge";

const empty = { description: "", amount: 0, type: "despesa", category: "", account_id: "" };

export default function QuickEntryDialog({ open, onOpenChange, accounts, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState(empty);

  useEffect(() => {
    if (open) setFormData(empty);
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = formData.amount === "" ? 0 : parseFloat(formData.amount);
    if (!formData.description || !formData.account_id || amount <= 0) {
      return;
    }
    onSubmit({ ...formData, amount });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-600" />
            Lançamento Rápido
          </DialogTitle>
        </DialogHeader>
        <BranchBadge className="mb-2" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "receita" })}
                  className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all",
                    formData.type === "receita" ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
                >
                  <TrendingUp className="w-4 h-4" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "despesa" })}
                  className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all",
                    formData.type === "despesa" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
                >
                  <TrendingDown className="w-4 h-4" /> Saída
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value === "" ? "" : e.target.value })}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Almoço, Combustível..."
            />
          </div>

          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select
              required
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {(formData.type === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700">
              <Zap className="w-4 h-4 mr-2" />
              {isSubmitting ? "Criando..." : "Registrar Agora"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}