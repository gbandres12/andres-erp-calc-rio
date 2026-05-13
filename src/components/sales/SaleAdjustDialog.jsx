import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, getTodayDate } from "@/components/utils/formatters";

export default function SaleAdjustDialog({ sale, open, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [newQuantity, setNewQuantity] = useState(
    sale?.items?.[0]?.quantity || sale?.total || 0
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!sale) return null;

  const originalQty = sale.items?.[0]?.quantity || 1;
  const originalTotal = sale.total || 0;
  const originalUnitPrice = originalTotal / originalQty;

  const newTotal = newQuantity * originalUnitPrice;
  const difference = originalTotal - newTotal;
  const adjustmentType = difference > 0 ? "crédito" : "débito";

  const handleConfirm = async () => {
    if (newQuantity <= 0 || newQuantity === originalQty) {
      toast.error("Quantidade deve ser diferente da original");
      return;
    }

    setLoading(true);
    try {
      // 1. Atualizar quantidade e total da venda
      const updatedItems = sale.items.map((item, i) =>
        i === 0
          ? { ...item, quantity: newQuantity, total: newQuantity * item.unit_price }
          : item
      );

      await base44.entities.Sale.update(sale.id, {
        items: updatedItems,
        total: newTotal,
        subtotal: newTotal,
        remaining_amount: newTotal - (sale.paid_amount || 0),
        notes: sale.notes
          ? `${sale.notes}\n[AJUSTE em ${getTodayDate()}] Quantidade: ${originalQty} → ${newQuantity} ton | Valor: ${formatBRL(originalTotal)} → ${formatBRL(newTotal)}`
          : `[AJUSTE em ${getTodayDate()}] Quantidade: ${originalQty} → ${newQuantity} ton | Valor: ${formatBRL(originalTotal)} → ${formatBRL(newTotal)}`
      });

      // 2. Se houve diferença, lançar ajuste no financeiro
      if (Math.abs(difference) > 0.01) {
        await base44.entities.Transaction.create({
          description: `Ajuste de venda ${sale.reference} - ${sale.client_name}`,
          amount: Math.abs(difference),
          type: difference > 0 ? "receita" : "despesa",
          category: "Ajustes",
          status: "pendente",
          due_date: getTodayDate(),
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: sale.company_id,
          notes: `Ajuste proporcional: ${originalQty} → ${newQuantity} ton\n${notes || ''}`
        });
      }

      toast.success("Venda ajustada com sucesso!");
      setNewQuantity(originalQty);
      setNotes("");
      setStep(1);
      onClose();
      onSuccess();
    } catch (error) {
      toast.error("Erro ao ajustar venda: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-600">
            Ajustar Venda — Passo {step} de 2
          </DialogTitle>
        </DialogHeader>

        {/* Info da venda */}
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <p className="font-bold">{sale.reference}</p>
          <p className="text-sm text-slate-500">{sale.client_name}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Quantidade original</p>
              <p className="font-semibold">{originalQty} ton</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor original</p>
              <p className="font-semibold">{formatBRL(originalTotal)}</p>
            </div>
          </div>
        </div>

        {/* PASSO 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nova quantidade (toneladas) *</Label>
              <Input
                type="number"
                step="0.01"
                value={newQuantity}
                onChange={(e) => setNewQuantity(parseFloat(e.target.value) || 0)}
                className="text-lg font-semibold"
              />
            </div>

            {newQuantity !== originalQty && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 space-y-2">
                <p className="text-sm font-semibold text-blue-900">Cálculo automático</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-blue-700">Valor unit.</p>
                    <p className="font-mono">{formatBRL(originalUnitPrice)}/ton</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Valor final</p>
                    <p className="font-mono text-lg font-bold">{formatBRL(newTotal)}</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Diferença</p>
                    <p className={`font-mono ${difference > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                      {difference > 0 ? '+' : ''}{formatBRL(difference)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Tipo ajuste</p>
                    <p className="font-mono capitalize">{adjustmentType}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={() => setStep(2)}
                disabled={newQuantity === originalQty}
              >
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASSO 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                Um lançamento de {adjustmentType} de *{formatBRL(Math.abs(difference))}* será criado automaticamente no financeiro.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Input
                placeholder="Motivo do ajuste, informações adicionais..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="bg-slate-100 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-semibold">Resumo do ajuste:</p>
              <p>📊 Quantidade: {originalQty} → {newQuantity} ton</p>
              <p>💰 Valor: {formatBRL(originalTotal)} → {formatBRL(newTotal)}</p>
              <p className={`${difference > 0 ? 'text-green-600' : 'text-orange-600'} font-semibold`}>
                {adjustmentType === 'crédito' ? '✅ Crédito: ' : '⚠️ Débito: '}{formatBRL(Math.abs(difference))}
              </p>
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>
                Voltar
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? "Ajustando..." : "Confirmar Ajuste"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}