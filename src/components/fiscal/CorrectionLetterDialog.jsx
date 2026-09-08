import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

export default function CorrectionLetterDialog({ open, onClose, onConfirm }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const length = text.trim().length;
  const valid = length >= 15 && length <= 1000;

  const handleConfirm = async () => {
    if (!valid) return;
    setLoading(true);
    await onConfirm(text.trim());
    setLoading(false);
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <FileText className="w-5 h-5" />
            Carta de Correção (CC-e)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p className="font-medium">A correção é anexada à nota autorizada na SEFAZ.</p>
            <p className="mt-1">Não pode corrigir: impostos, base de cálculo, alíquotas, emitente, destinatário e data de emissão.</p>
          </div>
          <div className="space-y-2">
            <Label>Texto da correção *</Label>
            <Textarea
              placeholder="Descreva a correção detalhadamente (ex.: Alteração do campo GTIN (cEAN) do item 1 para 7898976161169.)"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <p className={`text-xs ${valid ? "text-green-600" : "text-slate-400"}`}>
              {length} caracteres {valid ? "✓" : "(mínimo 15, máximo 1000)"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Voltar</Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !valid}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {loading ? "Enviando..." : "Enviar Correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}