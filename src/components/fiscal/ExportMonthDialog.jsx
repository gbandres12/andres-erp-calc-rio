import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/components/utils/formatters";

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function ExportMonthDialog({ open, onOpenChange, companyId }) {
  const [month, setMonth] = useState(currentMonth());
  const [preview, setPreview] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !month) return;
    setPreview(null); setResult(null); setError("");
    base44.functions.invoke("exportMonthlyInvoices", { company_id: companyId, month, preview: true })
      .then(r => setPreview(r.data))
      .catch(e => setError(e.response?.data?.error || e.message));
  }, [open, month, companyId]);

  const handleExport = async () => {
    setExporting(true); setError(""); setResult(null);
    try {
      const { data } = await base44.functions.invoke("exportMonthlyInvoices", { company_id: companyId, month });
      const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setExporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar notas do mês</DialogTitle>
          <DialogDescription>XMLs das notas autorizadas + planilha resumo para o contador.</DialogDescription>
        </DialogHeader>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm min-h-14">
          {!preview && !error && <span className="flex items-center text-slate-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Buscando notas...</span>}
          {preview && (
            <>
              <p className="font-semibold text-slate-800">{preview.authorized} notas autorizadas encontradas</p>
              <p className="text-slate-500">Total: {formatCurrency(preview.total)}</p>
              {preview.cancelled > 0 && <p className="text-amber-700 text-xs mt-1">{preview.cancelled} cancelada(s)/inutilizada(s) ficarão de fora (listadas na planilha).</p>}
            </>
          )}
        </div>
        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.missing.length ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
            <p className="flex items-center font-medium">
              {result.missing.length ? <AlertTriangle className="w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {result.included} XMLs incluídos no pacote
            </p>
            {result.missing.length > 0 && <p className="text-xs mt-1">Sem XML: {result.missing.join(", ")}</p>}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleExport} disabled={exporting || !preview?.authorized}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {exporting ? "Gerando pacote..." : "Baixar ZIP"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}