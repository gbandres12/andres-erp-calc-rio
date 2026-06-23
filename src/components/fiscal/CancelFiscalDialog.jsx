import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export default function CancelFiscalDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (reason.trim().length < 15) return;
    setLoading(true);
    await onConfirm(reason.trim());
    setLoading(false);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Cancelar Nota Fiscal
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <p className="font-medium">Atenção: Esta ação não pode ser desfeita.</p>
            <p className="mt-1">O cancelamento só é permitido em até 24 horas após a autorização (NF-e) e será comunicado à SEFAZ.</p>
          </div>
          <div className="space-y-2">
            <Label>Justificativa de cancelamento *</Label>
            <Textarea
              placeholder="Descreva o motivo do cancelamento (mínimo 15 caracteres, exigência SEFAZ)..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
            />
            <p className={`text-xs ${reason.trim().length >= 15 ? "text-green-600" : "text-slate-400"}`}>
              {reason.trim().length} caracteres {reason.trim().length < 15 ? `(mínimo 15)` : "✓"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Voltar</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || reason.trim().length < 15}
          >
            {loading ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}