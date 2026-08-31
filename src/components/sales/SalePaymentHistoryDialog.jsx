import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, DollarSign, Tag, Calendar, CreditCard, TrendingDown, Receipt, Pencil, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatBRL, formatDate } from "@/components/utils/formatters";
import { toast } from "sonner";
import SalePaymentDateEditDialog from "./SalePaymentDateEditDialog";
import DeleteAuthDialog from "./DeleteAuthDialog";
import { deleteProtectedRecord } from "@/utils/protectedDelete";

const METHOD_LABELS = {
  dinheiro: "💵 Dinheiro",
  pix: "📱 PIX",
  cartao_credito: "💳 Cartão Crédito",
  cartao_debito: "💳 Cartão Débito",
  transferencia: "🏦 Transferência",
  cheque: "📝 Cheque",
  boleto: "🧽 Boleto"
};

export default function SalePaymentHistoryDialog({ sale, open, onClose }) {
  const queryClient = useQueryClient();
  const [editingPayment, setEditingPayment] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: payments = [] } = useQuery({
    queryKey: ["sale-payments-history", sale?.id],
    queryFn: () => base44.entities.SalePayment.filter({ sale_id: sale.id }, "payment_date"),
    enabled: !!open && !!sale?.id,
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async ({ payment, password }) => {
      await deleteProtectedRecord({
        kind: "sale_payment",
        id: payment.id,
        password,
        company_id: sale.company_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale-payments-history", sale?.id] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", sale?.id] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Pagamento excluído e saldos recalculados.");
      setPendingDelete(null);
      setAuthOpen(false);
    },
    onError: (err) => {
      toast.error("Erro ao excluir pagamento: " + err.message);
    }
  });

  if (!sale) return null;

  const totalPago = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAbatimento = payments.reduce((s, p) => s + (p.discount || 0), 0);
  const abatimentos = payments.filter(p => (p.discount || 0) > 0);
  const pagamentos = payments.filter(p => (p.amount || 0) > 0);

  const handleDeleteClick = (p) => {
    setPendingDelete(p);
    setAuthOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Histórico Financeiro — {sale.reference}
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

        <Tabs defaultValue="pagamentos" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="abatimentos" className="text-xs">
              <TrendingDown className="w-3.5 h-3.5 mr-1" />
              Abatimentos ({abatimentos.length})
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="text-xs">
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Pagamentos ({pagamentos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="abatimentos" className="space-y-2 mt-3">
            {abatimentos.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">Nenhum abatimento registrado nesta venda.</p>
            ) : abatimentos.map((p, i) => (
              <div key={p.id} className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-purple-800">{formatBRL(p.discount)}</p>
                    <Badge variant="outline" className="bg-white text-purple-700 border-purple-200">Abatimento #{i + 1}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(p.payment_date)}
                      <button type="button" onClick={() => setEditingPayment(p)} className="ml-0.5 text-violet-600" title="Alterar data">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </span>
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      {METHOD_LABELS[p.payment_method] || p.payment_method}
                    </span>
                  </div>
                  {p.notes && <p className="text-xs text-slate-500 italic mt-1">{p.notes}</p>}
                </div>
                <button type="button" onClick={() => handleDeleteClick(p)} disabled={deletePaymentMutation.isPending} className="text-red-500 hover:bg-red-100 p-1.5 rounded" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="pagamentos" className="space-y-2 mt-3 max-h-[50vh] overflow-auto">
            {pagamentos.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">Nenhum pagamento registrado.</p>
            ) : pagamentos.map((p, i) => (
              <div key={p.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">{formatBRL(p.amount)}</p>
                    <Badge variant="outline">#{i + 1}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(p.payment_date)}
                      <button type="button" onClick={() => setEditingPayment(p)} className="ml-0.5 text-violet-600">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </span>
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      {METHOD_LABELS[p.payment_method] || p.payment_method}
                    </span>
                  </div>
                  {(p.discount || 0) > 0 && (
                    <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 mt-1">
                      <Tag className="w-3 h-3 mr-1" /> Abatimento: {formatBRL(p.discount)}
                    </Badge>
                  )}
                  {p.notes && <p className="text-xs text-slate-400 italic">{p.notes}</p>}
                </div>
                <button type="button" onClick={() => handleDeleteClick(p)} disabled={deletePaymentMutation.isPending} className="text-red-500 hover:bg-red-100 p-1.5 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t">
          <Receipt className="w-3.5 h-3.5" />
          <span>Saldo atual: <strong className="text-slate-700">{formatBRL(sale.remaining_amount || 0)}</strong></span>
        </div>

        <SalePaymentDateEditDialog
          payment={editingPayment}
          saleId={sale.id}
          open={!!editingPayment}
          onClose={() => setEditingPayment(null)}
        />

        <DeleteAuthDialog
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          itemType="pagamento"
          onSuccess={(password) => {
            if (pendingDelete) deletePaymentMutation.mutate({ payment: pendingDelete, password });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
