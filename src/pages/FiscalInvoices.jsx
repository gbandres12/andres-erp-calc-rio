import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, RefreshCw, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatDate } from "@/components/utils/formatters";

const STATUS_CONFIG = {
  rascunho:        { label: "Rascunho",         color: "bg-slate-100 text-slate-700" },
  validando:       { label: "Validando",         color: "bg-blue-100 text-blue-700" },
  pendente_envio:  { label: "Pendente Envio",    color: "bg-yellow-100 text-yellow-700" },
  enviada:         { label: "Enviada",           color: "bg-indigo-100 text-indigo-700" },
  processando:     { label: "Processando",       color: "bg-purple-100 text-purple-700" },
  autorizada:      { label: "Autorizada",        color: "bg-green-100 text-green-700" },
  rejeitada:       { label: "Rejeitada",         color: "bg-red-100 text-red-700" },
  erro_integracao: { label: "Erro Integração",   color: "bg-orange-100 text-orange-700" },
  cancelada:       { label: "Cancelada",         color: "bg-slate-200 text-slate-600" },
  inutilizada:     { label: "Inutilizada",       color: "bg-gray-100 text-gray-600" }
};

const DOC_TYPES = { nfe: "NF-e", nfse: "NFS-e", nfce: "NFC-e" };

const STATUS_GROUPS = {
  aprovada: ["autorizada"],
  pendente: ["validando", "pendente_envio", "enviada", "processando"],
  cancelada: ["cancelada", "inutilizada"]
};

export default function FiscalInvoices() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const companyId = localStorage.getItem("selectedCompanyId");
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["fiscal_invoices", companyId],
    queryFn: () => base44.entities.FiscalInvoice.filter({ company_id: companyId }, "-created_date", 100),
    enabled: !!companyId
  });

  const filtered = invoices.filter(inv => {
    const matchesStatus = filterStatus === "all" || STATUS_GROUPS[filterStatus]?.includes(inv.status);
    const matchesSearch = !search ||
      inv.reference?.toLowerCase().includes(search.toLowerCase()) ||
      inv.recipient_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.api_access_key?.includes(search);
    return matchesStatus && matchesSearch;
  });

  const stats = {
    total: invoices.length,
    aprovadas: invoices.filter(i => STATUS_GROUPS.aprovada.includes(i.status)).length,
    pendentes: invoices.filter(i => STATUS_GROUPS.pendente.includes(i.status)).length,
    canceladas: invoices.filter(i => STATUS_GROUPS.cancelada.includes(i.status)).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notas Fiscais</h1>
          <p className="text-slate-500 text-sm mt-1">Controle de emissão por status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries(["fiscal_invoices"])}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button asChild>
            <Link to={createPageUrl("FiscalInvoiceForm")}>
              <Plus className="w-4 h-4 mr-1" /> Nova Nota
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-slate-700" },
          { label: "Aprovadas", value: stats.aprovadas, color: "text-green-600" },
          { label: "Pendentes", value: stats.pendentes, color: "text-amber-600" },
          { label: "Canceladas", value: stats.canceladas, color: "text-slate-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por nº, cliente, chave..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as notas</SelectItem>
            <SelectItem value="aprovada">Aprovadas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <FileText className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhuma nota encontrada</p>
            <Button asChild variant="link" size="sm" className="mt-1">
              <Link to={createPageUrl("FiscalInvoiceForm")}>Criar primeira nota</Link>
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Referência</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Destinatário</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Data</th>
                <th className="text-right px-4 py-3 text-slate-600 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-slate-600 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-slate-600 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(inv => {
                const sc = STATUS_CONFIG[inv.status] || { label: inv.status, color: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-800">{inv.reference}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                        {DOC_TYPES[inv.document_type] || inv.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{inv.recipient_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`${createPageUrl("FiscalInvoiceDetail")}?id=${inv.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}