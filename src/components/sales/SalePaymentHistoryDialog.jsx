import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, DollarSign, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatBRL, formatDate } from "@/components/utils/formatters";

const METHOD_LABELS = {
  dinheiro: "💵 Dinheiro",
  pix: "📱 PIX",
  cartao_credito: "💳 Cartão Crédito",
  cartao_debito: "💳 Cartão Débito",
  transferencia: "🏦 Transferência",
  cheque: "📝 Cheque",
  boleto: "🧾 Boleto"
};

export default function SalePaymentHistoryDialog({ sale, open, onClose }) {
  const { data: payments = [] } = useQuery({
    queryKey: ["sale-payments-history", sale?.id],
    queryFn: () => base44.entities.SalePayment.filter({ sale_id: sale.id }, "payment_date"),
    enabled: !!open && !!sale?.id,
    initialData: []
  });

  if (!sale) return null;

  const totalPago = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAbatimento = payments.reduce((s, p) => s + (p.discount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Histórico de Pagamentos — {sale.reference}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Total da Venda</p>
            <p className="font-bold text-slate-800">{formatBRL(sale.total || 0)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600">Total Pago</p>
            <p className="font-bold text-green-700">{formatBRL(totalPago)}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-xs text-purple-600">Total Abatido</p>
            <p className="font-bold text-purple-700">{formatBRL(totalAbatimento)}</p>
          </div>
        </div>

        <div className="space-y-3 max-h-[55vh] overflow-auto">
          {payments.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Nenhum pagamento registrado.</p>
          ) : (
            payments.map((p, i) => (
              <div key={p.id} className="flex justify-between items-start p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <p className="font-semibold text-slate-800">{formatBRL(p.amount)}</p>
                    {(p.discount || 0) > 0 && (
                      <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                        <Tag className="w-3 h-3 mr-1" />
                        Abatimento: {formatBRL(p.discount)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDate(p.payment_date)} • {METHOD_LABELS[p.payment_method] || p.payment_method}
                  </p>
                  {p.notes && <p className="text-xs text-slate-400 italic">{p.notes}</p>}
                </div>
                <Badge variant="outline">#{payments.length - i}</Badge>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}