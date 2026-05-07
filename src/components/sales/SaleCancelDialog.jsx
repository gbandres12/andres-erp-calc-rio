import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, XCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, getTodayDate } from "@/components/utils/formatters";

const CANCEL_REASONS = [
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "produto_indisponivel", label: "Produto indisponível" },
  { value: "erro_cadastro", label: "Erro no cadastro" },
  { value: "preco_incorreto", label: "Preço incorreto" },
  { value: "cliente_nao_retirou", label: "Cliente não retirou o pedido" },
  { value: "acordo_comercial", label: "Acordo comercial / renegociação" },
  { value: "inadimplencia", label: "Inadimplência do cliente" },
  { value: "outro", label: "Outro motivo" },
];

const PAID_ACTIONS = [
  { value: "nenhuma", label: "Nenhuma ação — manter registros como estão" },
  { value: "estornar", label: "Estornar — remover lançamentos financeiros" },
  { value: "credito", label: "Registrar como crédito do cliente" },
  { value: "devolucao", label: "Devolução em dinheiro / PIX" },
];

const WITHDRAWAL_ACTIONS = [
  { value: "nenhuma", label: "Nenhuma ação — cliente ficará com o material" },
  { value: "devolucao", label: "Cliente devolverá o material ao estoque" },
  { value: "parcial", label: "Devolução parcial (descreva nas observações)" },
];

export default function SaleCancelDialog({ sale, open, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    cancelReason: "",
    cancelReasonDetail: "",
    paidAction: "nenhuma",
    withdrawalAction: "nenhuma",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  if (!sale) return null;

  const hasPaid = (sale.paid_amount || 0) > 0;
  const hasWithdrawals = (sale.withdrawal_status === "parcial" || sale.withdrawal_status === "total");
  const totalSteps = hasPaid || hasWithdrawals ? 3 : 2;

  const resetAndClose = () => {
    setStep(1);
    setForm({ cancelReason: "", cancelReasonDetail: "", paidAction: "nenhuma", withdrawalAction: "nenhuma", notes: "" });
    onClose();
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // Montar nota completa do cancelamento
      const reasonLabel = CANCEL_REASONS.find(r => r.value === form.cancelReason)?.label || form.cancelReason;
      const paidLabel = PAID_ACTIONS.find(r => r.value === form.paidAction)?.label || "";
      const withdrawalLabel = WITHDRAWAL_ACTIONS.find(r => r.value === form.withdrawalAction)?.label || "";

      const cancelNote = [
        `[CANCELADO em ${getTodayDate()}]`,
        `Motivo: ${reasonLabel}`,
        form.cancelReasonDetail ? `Detalhe: ${form.cancelReasonDetail}` : null,
        hasPaid ? `Valores pagos: ${paidLabel}` : null,
        hasWithdrawals ? `Retiradas: ${withdrawalLabel}` : null,
        form.notes ? `Observações: ${form.notes}` : null,
      ].filter(Boolean).join(" | ");

      // 1. Marcar venda como cancelada
      await base44.entities.Sale.update(sale.id, {
        status: "cancelada",
        notes: sale.notes ? `${sale.notes}\n\n${cancelNote}` : cancelNote,
      });

      // 2. Ação sobre financeiro
      if (form.paidAction === "estornar") {
        // Buscar e deletar transações vinculadas
        const allTransactions = await base44.entities.Transaction.filter({ company_id: sale.company_id });
        const saleTransactions = allTransactions.filter(
          t => t.notes?.includes(sale.reference) || t.description?.includes(sale.reference)
        );
        for (const t of saleTransactions) {
          await base44.entities.Transaction.delete(t.id);
        }

        // Deletar pagamentos e parcelas
        const salePayments = await base44.entities.SalePayment.filter({ sale_id: sale.id });
        for (const p of salePayments) await base44.entities.SalePayment.delete(p.id);

        const installments = await base44.entities.SaleInstallment.filter({ sale_id: sale.id });
        for (const inst of installments) await base44.entities.SaleInstallment.delete(inst.id);

        // Recalcular saldo das contas
        await base44.functions.invoke('recalculateBalance', { company_id: sale.company_id });

      } else if (form.paidAction === "credito") {
        // Criar lançamento de crédito a favor do cliente
        await base44.entities.Transaction.create({
          description: `Crédito por cancelamento - ${sale.reference} - ${sale.client_name}`,
          amount: sale.paid_amount,
          type: "despesa",
          category: "Cancelamentos",
          status: "pendente",
          due_date: getTodayDate(),
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: sale.company_id,
          notes: cancelNote,
        });

        // Cancelar parcelas pendentes
        const installments = await base44.entities.SaleInstallment.filter({ sale_id: sale.id });
        for (const inst of installments) {
          if (inst.status === "pendente") await base44.entities.SaleInstallment.delete(inst.id);
        }

      } else if (form.paidAction === "devolucao") {
        // Criar lançamento de saída (devolução)
        await base44.entities.Transaction.create({
          description: `Devolução por cancelamento - ${sale.reference} - ${sale.client_name}`,
          amount: sale.paid_amount,
          type: "despesa",
          category: "Cancelamentos",
          status: "pendente",
          due_date: getTodayDate(),
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: sale.company_id,
          notes: cancelNote,
        });

        // Cancelar parcelas pendentes
        const installments = await base44.entities.SaleInstallment.filter({ sale_id: sale.id });
        for (const inst of installments) {
          if (inst.status === "pendente") await base44.entities.SaleInstallment.delete(inst.id);
        }

      } else {
        // Nenhuma ação financeira — apenas cancelar parcelas pendentes
        const installments = await base44.entities.SaleInstallment.filter({ sale_id: sale.id });
        for (const inst of installments) {
          if (inst.status === "pendente") await base44.entities.SaleInstallment.delete(inst.id);
        }
      }

      toast.success("Venda cancelada com sucesso!");
      resetAndClose();
      onSuccess();
    } catch (error) {
      toast.error("Erro ao cancelar venda: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep1 = form.cancelReason !== "";
  const canProceedStep2 = true; // ações têm valor padrão

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="w-5 h-5" />
            Cancelar Venda — Passo {step} de {totalSteps}
          </DialogTitle>
        </DialogHeader>

        {/* Info da venda */}
        <div className="bg-slate-50 rounded-lg p-3 flex justify-between items-center">
          <div>
            <p className="font-bold">{sale.reference}</p>
            <p className="text-sm text-slate-500">{sale.client_name}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatBRL(sale.total)}</p>
            {hasPaid && <p className="text-xs text-green-700">Pago: {formatBRL(sale.paid_amount)}</p>}
            {sale.remaining_amount > 0 && <p className="text-xs text-orange-600">Restante: {formatBRL(sale.remaining_amount)}</p>}
          </div>
        </div>

        {/* PASSO 1 — Motivo */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Qual o motivo do cancelamento? *</Label>
              <Select value={form.cancelReason} onValueChange={v => setForm({ ...form, cancelReason: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Detalhes adicionais (opcional)</Label>
              <Textarea
                placeholder="Descreva com mais detalhes se necessário..."
                value={form.cancelReasonDetail}
                onChange={e => setForm({ ...form, cancelReasonDetail: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetAndClose}>Voltar</Button>
              <Button onClick={() => setStep(hasPaid || hasWithdrawals ? 2 : 3)} disabled={!canProceedStep1}>
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASSO 2 — Ações financeiras / retiradas */}
        {step === 2 && (
          <div className="space-y-4">
            {hasPaid && (
              <div className="space-y-2">
                <Label className="font-semibold">
                  O cliente pagou {formatBRL(sale.paid_amount)}. O que fazer com esse valor?
                </Label>
                <div className="space-y-2">
                  {PAID_ACTIONS.map(a => (
                    <div
                      key={a.value}
                      onClick={() => setForm({ ...form, paidAction: a.value })}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${
                        form.paidAction === a.value ? "border-blue-500 bg-blue-50" : ""
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        form.paidAction === a.value ? "bg-blue-600 border-blue-600" : "border-slate-300"
                      }`} />
                      <span className="text-sm">{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasWithdrawals && (
              <div className="space-y-2">
                <Label className="font-semibold">
                  Houve retiradas de material. O que o cliente fará com o material?
                </Label>
                <div className="space-y-2">
                  {WITHDRAWAL_ACTIONS.map(a => (
                    <div
                      key={a.value}
                      onClick={() => setForm({ ...form, withdrawalAction: a.value })}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${
                        form.withdrawalAction === a.value ? "border-blue-500 bg-blue-50" : ""
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        form.withdrawalAction === a.value ? "bg-blue-600 border-blue-600" : "border-slate-300"
                      }`} />
                      <span className="text-sm">{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)}>
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASSO 3 — Resumo e confirmação */}
        {step === 3 && (
          <div className="space-y-4">
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">
                Revise o resumo abaixo antes de confirmar. <strong>Esta ação não pode ser desfeita.</strong>
              </AlertDescription>
            </Alert>

            {/* Resumo */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Motivo:</span>
                <span className="font-medium">{CANCEL_REASONS.find(r => r.value === form.cancelReason)?.label}</span>
              </div>
              {hasPaid && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Valores pagos:</span>
                  <span className="font-medium">{PAID_ACTIONS.find(a => a.value === form.paidAction)?.label?.split(" —")[0]}</span>
                </div>
              )}
              {hasWithdrawals && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Material:</span>
                  <span className="font-medium">{WITHDRAWAL_ACTIONS.find(a => a.value === form.withdrawalAction)?.label?.split(" —")[0]}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações finais (opcional)</Label>
              <Textarea
                placeholder="Qualquer informação adicional para o histórico..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(hasPaid || hasWithdrawals ? 2 : 1)} disabled={loading}>
                Voltar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? "Cancelando..." : "Confirmar Cancelamento"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}