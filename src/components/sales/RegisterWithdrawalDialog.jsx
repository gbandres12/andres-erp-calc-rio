import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import BranchBadge from "@/components/BranchBadge";
import { applyWithdrawal } from "@/utils/saleWithdrawal";

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function RegisterWithdrawalDialog({ open, onOpenChange, sale, item }) {
  const queryClient = useQueryClient();
  const pending = item ? Math.max(0, (item.quantity || 0) - (item.quantity_withdrawn || 0)) : 0;
  const [form, setForm] = useState({ quantity: "", withdrawal_date: nowLocalInput(), responsible: "", vehicle_plate: "", notes: "" });

  useEffect(() => {
    if (open && item) {
      setForm({ quantity: String(pending), withdrawal_date: nowLocalInput(), responsible: "", vehicle_plate: "", notes: "" });
    }
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: () => applyWithdrawal(base44, {
      saleId: sale.id,
      productId: item.product_id,
      quantity: parseFloat(form.quantity),
      withdrawalDate: new Date(form.withdrawal_date).toISOString(),
      responsible: form.responsible,
      vehiclePlate: form.vehicle_plate,
      notes: form.notes
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['sales']);
      queryClient.invalidateQueries(['withdrawals']);
      toast.success(`Retirada de ${res.applied} ${item.unit} registrada na venda ${res.saleRef}.`);
      onOpenChange(false);
    },
    onError: (e) => toast.error("Erro ao registrar retirada: " + e.message)
  });

  const qty = parseFloat(form.quantity) || 0;
  const isValid = !!sale && !!item && qty > 0 && qty <= pending + 0.001;

  return (
    <Dialog open={open && !!sale && !!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar Retirada</DialogTitle></DialogHeader>
        <BranchBadge className="mb-2" />
        {sale && item && (
          <div className="space-y-4 py-2">
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <p><span className="text-slate-500">Venda:</span> <span className="font-semibold">{sale.reference} — {sale.client_name}</span></p>
              <p><span className="text-slate-500">Produto:</span> <span className="font-semibold">{item.product_name || "—"}</span></p>
              <p><span className="text-slate-500">Saldo pendente:</span> <span className="font-semibold text-red-600">{pending} {item.unit}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantidade ({item.unit})</Label>
                <Input type="number" step="0.001" value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Data/Hora</Label>
                <Input type="datetime-local" value={form.withdrawal_date}
                  onChange={e => setForm({ ...form, withdrawal_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Placa do Veículo</Label>
                <Input value={form.vehicle_plate} onChange={e => setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })} placeholder="ABC-1234" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Confirmar Retirada"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}