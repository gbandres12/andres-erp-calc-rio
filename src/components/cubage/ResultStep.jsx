import React from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmtTons = (t) => Number(t).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Etapa 5: resultado da cubagem, comparação com a balança e gravação
export default function ResultStep({
  analysis, vehicle, product, factor, mode, scaleNetKg, tolerance, saving, onConfirm, onRetryPhotos,
}) {
  const scaleTons = scaleNetKg ? scaleNetKg / 1000 : null;
  const photoIssues = (analysis.photos_quality || []).filter((q) => !q.ok);

  return (
    <div className="space-y-4">
      <div className="p-4 border-2 border-violet-300 bg-white rounded-xl space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cubagem por IA</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-violet-50 rounded-lg">
            <p className="text-xs text-slate-500">Altura</p>
            <p className="text-base font-bold text-violet-800">{analysis.estimated_height_m} m</p>
          </div>
          <div className="p-2 bg-violet-50 rounded-lg">
            <p className="text-xs text-slate-500">Volume</p>
            <p className="text-base font-bold text-violet-800">{analysis.volume_m3} m³</p>
          </div>
          <div className="p-2 bg-violet-50 rounded-lg">
            <p className="text-xs text-slate-500">Estimado</p>
            <p className="text-base font-bold text-violet-800">~{fmtTons(analysis.estimated_tons)} t</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          ±{analysis.margin_percent}% (confiança {analysis.confidence}) · Forma: {analysis.load_shape || "—"} ·
          Fator {factor} t/m³ {product ? `(${product.name})` : ""}
        </p>
      </div>

      {mode === "conference" && scaleTons != null && (
        <div className={`p-4 border-2 rounded-xl space-y-3 ${analysis.alert ? "border-red-400 bg-red-50" : "border-green-300 bg-green-50"}`}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-500">Balança</p>
              <p className="text-xl font-bold text-slate-900">{fmtTons(scaleTons)} t</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cubagem</p>
              <p className="text-xl font-bold text-violet-800">~{fmtTons(analysis.estimated_tons)} t</p>
            </div>
          </div>
          <p className={`text-sm font-semibold text-center ${analysis.alert ? "text-red-700" : "text-green-700"}`}>
            Divergência: {analysis.diff_percent > 0 ? "+" : ""}{analysis.diff_percent}% (tolerância {tolerance}%)
          </p>
          {analysis.alert && (
            <p className="text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Divergência acima da tolerância. Verifique se a carga está deslocada, o produto/fator está certo
              ou refaça as fotos.
            </p>
          )}
        </div>
      )}

      {photoIssues.length > 0 && (
        <div className="p-3 border-2 border-amber-300 bg-amber-50 rounded-xl">
          <p className="text-sm font-semibold text-amber-900 mb-1">Atenção nas fotos:</p>
          <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
            {photoIssues.map((q, i) => <li key={i}>Foto {q.index + 1}: {q.issue || "qualidade baixa"}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1 h-12" onClick={onRetryPhotos} disabled={saving}>
          <RefreshCw className="w-5 h-5" /> Refazer fotos
        </Button>
        <Button size="lg" className="flex-1 h-12 text-base" onClick={onConfirm} disabled={saving}>
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          Confirmar
        </Button>
      </div>
    </div>
  );
}