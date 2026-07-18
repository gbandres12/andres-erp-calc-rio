import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ImportUploader({ title, description, jsonSchema, columns, transform, entityName, warning }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setRows([]);
    setDone(0);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: { type: "object", properties: { registros: { type: "array", items: jsonSchema } } }
      });
      if (result.status !== "success") throw new Error(result.details || "Falha ao ler o arquivo");
      const extracted = Array.isArray(result.output) ? result.output : result.output?.registros || [];
      if (!extracted.length) throw new Error("Nenhum registro reconhecido no arquivo");
      setRows(extracted);
      toast.success(`${extracted.length} registros lidos do arquivo`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const records = rows.map(transform).filter(Boolean);
      if (!records.length) throw new Error("Nenhum registro válido para importar");
      await base44.entities[entityName].bulkCreate(records);
      setDone(records.length);
      setRows([]);
      toast.success(`${records.length} registros importados!`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      {warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">{warning}</div>
      )}
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors">
        {loading
          ? <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
          : <Upload className="w-6 h-6 text-slate-400" />}
        <span className="text-sm text-slate-600 font-medium">
          {loading ? "Lendo arquivo..." : "Clique para enviar CSV, Excel ou PDF do emissor antigo"}
        </span>
        <input type="file" accept=".csv,.xlsx,.xls,.json,.pdf" className="hidden" onChange={handleFile} disabled={loading} />
      </label>

      {done > 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4" /> {done} registros importados com sucesso.
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>{columns.map(c => <th key={c.key} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(c => <td key={c.key} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{String(row[c.key] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={handleImport} disabled={importing} className="w-full bg-violet-600 hover:bg-violet-700">
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {importing ? "Importando..." : `Importar ${rows.length} registros`}
          </Button>
        </div>
      )}
    </div>
  );
}