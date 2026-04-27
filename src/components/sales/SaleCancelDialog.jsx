import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/components/utils/formatters";

export default function SaleCancelDialog({ sale, open, onClose, onSuccess }) {
  const [cancelReason, setCancelReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteFinancial, setDeleteFinancial] = useState(true);

  if (!sale) return null;

  const handleCancel = async () => {
    setLoading(true);
    try {
      // 1. Marcar venda como cancelada
      await base44.entities.Sale.update(sale.id, {
        status: "cancelada",
        notes: sale.notes
          ? `${sale.notes}\n\n[CANCELADO]: ${cancelReason}`
          : `[CANCELADO]: ${cancelReason}`,
      });

      if (deleteFinancial) {
        // 2. Buscar e deletar transações vinculadas à venda
        const allTransactions = await base44.entities.Transaction.filter({
          company_id: sale.company_id,
        });
        const saleTransactions = allTransactions.filter(
          (t) =>
            t.notes?.includes(sale.reference) ||
            t.description?.includes(sale.reference)
        );
        for (const t of saleTransactions) {
          await base44.entities.Transaction.delete(t.id);
        }

        // 3. Buscar e deletar pagamentos vinculados
        const salePayments = await base44.entities.SalePayment.filter({
          sale_id: sale.id,
        });
        for (const p of salePayments) {
          await base44.entities.SalePayment.delete(p.id);
        }

        // 4. Buscar e deletar parcelas vinculadas
        const installments = await base44.entities.SaleInstallment.filter({
          sale_id: sale.id,
        });
        for (const inst of installments) {
          await base44.entities.SaleInstallment.delete(inst.id);
        }
      }

      toast.success(
        deleteFinancial
          ? "Venda cancelada e movimentações financeiras removidas!"
          : "Venda cancelada com sucesso!"
      );
      setCancelReason("");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Erro ao cancelar venda: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="w-5 h-5" />
            Cancelar Venda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info da venda */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">{sale.reference}</span>
              <Badge className="bg-blue-100 text-blue-800">{sale.status}</Badge>
            </div>
            <p className="text-sm text-slate-600">{sale.client_name}</p>
            <p className="text-base font-semibold">{formatBRL(sale.total)}</p>
            {sale.paid_amount > 0 && (
              <p className="text-sm text-green-700">
                Já pago: {formatBRL(sale.paid_amount)}
              </p>
            )}
          </div>

          {/* Alerta */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              Esta ação <strong>não pode ser desfeita</strong>. A venda será marcada como cancelada.
            </AlertDescription>
          </Alert>

          {/* Opção de deletar financeiro */}
          <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50"
            onClick={() => setDeleteFinancial(!deleteFinancial)}>
            <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              deleteFinancial ? "bg-red-600 border-red-600" : "border-slate-300"
            }`}>
              {deleteFinancial && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                <Trash2 className="w-4 h-4 text-red-500" />
                Apagar movimentações financeiras
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Remove transações, pagamentos e parcelas vinculados a esta venda do financeiro.
              </p>
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo do cancelamento *</Label>
            <Textarea
              placeholder="Descreva o motivo do cancelamento..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Voltar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleCancel}
              disabled={loading || !cancelReason.trim()}
            >
              {loading ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}