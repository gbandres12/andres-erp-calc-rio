import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function ImportDocumentDialog({ open, onOpenChange, onImported }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setPreview(null);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const signed = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
      const res = await base44.functions.invoke("importFiscalDocument", { file_url: signed.signed_url });
      const data = res.data;
      if (data.error) throw new Error(data.error);
      setPreview(data);
      toast.success("Dados lidos do arquivo — confira antes de aplicar");
    } catch (err) {
      toast.error(err.message || "Falha ao ler o arquivo");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-600" /> Importar PDF ou XML
          </DialogTitle>
          <DialogDescription>
            Envie o XML ou o PDF (DANFE) de uma nota fiscal para preencher o formulário automaticamente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
            <p className="text-sm text-slate-500">Lendo o arquivo...</p>
          </div>
        ) : !preview ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors">
            <Upload className="w-7 h-7 text-slate-400" />
            <span className="text-sm text-slate-600 font-medium">Clique para enviar o XML ou PDF da nota</span>
            <input type="file" accept=".xml,.pdf" className="hidden" onChange={handleFile} />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {preview.source === "xml" ? "XML lido com sucesso" : "PDF lido com sucesso"}
              {preview.numero ? ` — NF ${preview.numero}${preview.serie ? ` (série ${preview.serie})` : ""}` : ""}
            </div>
            <div className="text-sm space-y-1 rounded-lg border border-slate-200 p-3">
              <p><span className="text-slate-500">Destinatário:</span> <strong>{preview.destinatario?.nome || "—"}</strong></p>
              <p><span className="text-slate-500">CPF/CNPJ:</span> {preview.destinatario?.cpf_cnpj || "—"}</p>
              <p><span className="text-slate-500">Itens:</span> {preview.items.length}</p>
              <p><span className="text-slate-500">Total:</span> <strong>{fmt(preview.total)}</strong></p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}>Enviar outro arquivo</Button>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => onImported(preview)}>
                Usar dados na nota
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}