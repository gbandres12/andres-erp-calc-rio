import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, XCircle, Download, ExternalLink, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/components/utils/formatters";
import { emitFiscalInvoice } from "@/functions/emitFiscalInvoice";
import { queryFiscalStatus } from "@/functions/queryFiscalStatus";
import { cancelFiscalInvoice } from "@/functions/cancelFiscalInvoice";
import { toast } from "sonner";
import CancelFiscalDialog from "@/components/fiscal/CancelFiscalDialog";

const STATUS_CONFIG = {
  rascunho:        { label: "Rascunho",         color: "bg-slate-100 text-slate-700",   icon: Clock },
  validando:       { label: "Validando",         color: "bg-blue-100 text-blue-700",     icon: RefreshCw },
  pendente_envio:  { label: "Pendente Envio",    color: "bg-yellow-100 text-yellow-700", icon: Clock },
  enviada:         { label: "Enviada",           color: "bg-indigo-100 text-indigo-700", icon: RefreshCw },
  processando:     { label: "Processando",       color: "bg-purple-100 text-purple-700", icon: RefreshCw },
  autorizada:      { label: "Autorizada ✓",      color: "bg-green-100 text-green-700",   icon: CheckCircle },
  rejeitada:       { label: "Rejeitada",         color: "bg-red-100 text-red-700",       icon: XCircle },
  erro_integracao: { label: "Erro de Integração",color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  cancelada:       { label: "Cancelada",         color: "bg-slate-200 text-slate-600",   icon: XCircle },
};

export default function FiscalInvoiceDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const invoiceId = urlParams.get("id");
  const [showCancel, setShowCancel] = useState(false);
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["fiscal_invoice", invoiceId],
    queryFn: () => base44.entities.FiscalInvoice.get(invoiceId),
    enabled: !!invoiceId,
    refetchInterval: (data) => ["enviada","processando"].includes(data?.status) ? 10000 : false
  });

  const { data: events = [] } = useQuery({
    queryKey: ["fiscal_events", invoiceId],
    queryFn: () => base44.entities.FiscalEvent.filter({ invoice_id: invoiceId }, "-created_date", 20),
    enabled: !!invoiceId
  });

  const emitMutation = useMutation({
    mutationFn: () => emitFiscalInvoice({ invoice_id: invoiceId }),
    onSuccess: (res) => {
      if (res.data?.error) { toast.error(res.data.error); return; }
      toast.success("Nota enviada para emissão!");
      queryClient.invalidateQueries(["fiscal_invoice", invoiceId]);
      queryClient.invalidateQueries(["fiscal_events", invoiceId]);
    },
    onError: (e) => toast.error(e.message)
  });

  const checkStatusMutation = useMutation({
    mutationFn: () => queryFiscalStatus({ invoice_id: invoiceId }),
    onSuccess: (res) => {
      if (res.data?.error) { toast.error(res.data.error); return; }
      toast.success("Status atualizado");
      queryClient.invalidateQueries(["fiscal_invoice", invoiceId]);
    },
    onError: (e) => toast.error(e.message)
  });

  const handleCancel = async (reason) => {
    const res = await cancelFiscalInvoice({ invoice_id: invoiceId, reason });
    if (res.data?.success) {
      toast.success("Nota cancelada com sucesso");
      queryClient.invalidateQueries(["fiscal_invoice", invoiceId]);
    } else {
      toast.error(res.data?.error || "Erro ao cancelar");
    }
    setShowCancel(false);
  };

  if (isLoading || !invoice) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }

  const sc = STATUS_CONFIG[invoice.status] || { label: invoice.status, color: "bg-gray-100 text-gray-600", icon: Clock };
  const StatusIcon = sc.icon;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={createPageUrl("FiscalInvoices")}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{invoice.reference}</h1>
            <p className="text-slate-500 text-sm">{invoice.document_type?.toUpperCase()} — {invoice.environment === "producao" ? "Produção" : "Homologação"}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full ${sc.color}`}>
          <StatusIcon className="w-4 h-4" />
          {sc.label}
        </span>
      </div>

      {/* Erro */}
      {invoice.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700">Erro: {invoice.error_code}</p>
          <p className="text-sm text-red-600 mt-1">{invoice.error_message}</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {["rascunho","pendente_envio","rejeitada","erro_integracao"].includes(invoice.status) && (
          <Button onClick={() => emitMutation.mutate()} disabled={emitMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
            {emitMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
            Emitir Nota
          </Button>
        )}
        {["enviada","processando","autorizada"].includes(invoice.status) && (
          <Button variant="outline" onClick={() => checkStatusMutation.mutate()} disabled={checkStatusMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1 ${checkStatusMutation.isPending ? "animate-spin" : ""}`} />
            Consultar Status
          </Button>
        )}
        {invoice.status === "autorizada" && (
          <>
            {invoice.xml_url && (
              <Button variant="outline" asChild>
                <a href={invoice.xml_url} target="_blank" rel="noreferrer"><Download className="w-4 h-4 mr-1" /> XML</a>
              </Button>
            )}
            {invoice.pdf_url && (
              <Button variant="outline" asChild>
                <a href={invoice.pdf_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1" /> DANFE</a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowCancel(true)} className="text-red-600 border-red-200 hover:bg-red-50">
              <XCircle className="w-4 h-4 mr-1" /> Cancelar Nota
            </Button>
          </>
        )}
      </div>

      {/* Dados principais */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Destinatário</h3>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-slate-800">{invoice.recipient_name}</p>
            <p className="text-slate-500">{invoice.recipient_cpf_cnpj}</p>
            <p className="text-slate-500">{invoice.recipient_email}</p>
            {invoice.recipient_address && (
              <p className="text-slate-500">
                {invoice.recipient_address.logradouro}, {invoice.recipient_address.numero} — {invoice.recipient_address.municipio}/{invoice.recipient_address.uf}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Dados Fiscais</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Série:</span><span className="font-medium">{invoice.serie}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Número:</span><span className="font-medium">{invoice.number || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Emissão:</span><span className="font-medium">{formatDate(invoice.issue_date)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Natureza:</span><span className="font-medium">{invoice.nature_operation}</span></div>
            {invoice.api_access_key && (
              <div className="pt-1">
                <p className="text-slate-500 text-xs">Chave de Acesso:</p>
                <p className="font-mono text-xs text-slate-700 break-all">{invoice.api_access_key}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Itens</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 text-slate-500 font-medium">#</th>
              <th className="text-left px-4 py-2 text-slate-500 font-medium">Produto</th>
              <th className="text-left px-4 py-2 text-slate-500 font-medium">NCM</th>
              <th className="text-left px-4 py-2 text-slate-500 font-medium">CFOP</th>
              <th className="text-right px-4 py-2 text-slate-500 font-medium">Qtd</th>
              <th className="text-right px-4 py-2 text-slate-500 font-medium">Unit.</th>
              <th className="text-right px-4 py-2 text-slate-500 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(invoice.items || []).map((item, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-slate-500">{item.sequence || i + 1}</td>
                <td className="px-4 py-2 text-slate-800">{item.product_name}</td>
                <td className="px-4 py-2 font-mono text-slate-600">{item.ncm || "—"}</td>
                <td className="px-4 py-2 font-mono text-slate-600">{item.cfop || "—"}</td>
                <td className="px-4 py-2 text-right">{item.quantity} {item.unit}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totais */}
        <div className="border-t border-slate-200 px-5 py-4 flex justify-end">
          <div className="space-y-1 text-sm w-64">
            <div className="flex justify-between text-slate-500"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.discount_total > 0 && <div className="flex justify-between text-red-600"><span>Desconto:</span><span>- {formatCurrency(invoice.discount_total)}</span></div>}
            {invoice.shipping > 0 && <div className="flex justify-between text-slate-500"><span>Frete:</span><span>{formatCurrency(invoice.shipping)}</span></div>}
            <div className="flex justify-between font-bold text-slate-800 text-base border-t pt-2"><span>Total:</span><span>{formatCurrency(invoice.total)}</span></div>
          </div>
        </div>
      </div>

      {/* Timeline de eventos */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide mb-4">Histórico de Eventos</h3>
          <div className="space-y-3">
            {events.map(ev => (
              <div key={ev.id} className="flex gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ev.status === "sucesso" ? "bg-green-500" : ev.status === "erro" ? "bg-red-500" : "bg-yellow-500"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 capitalize">{ev.event_type?.replace(/_/g, " ")}</span>
                    <span className="text-slate-400 text-xs">{formatDateTime(ev.created_date)}</span>
                    {ev.duration_ms && <span className="text-slate-400 text-xs">{ev.duration_ms}ms</span>}
                  </div>
                  {ev.error_message && <p className="text-red-500 text-xs mt-0.5">{ev.error_message}</p>}
                  {ev.response_summary && !ev.error_message && <p className="text-slate-500 text-xs mt-0.5 truncate">{ev.response_summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CancelFiscalDialog open={showCancel} onClose={() => setShowCancel(false)} onConfirm={handleCancel} />
    </div>
  );
}