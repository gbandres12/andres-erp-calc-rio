import React, { useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CameraCapture from "@/components/cubage/CameraCapture";
import { CUBAGE_ANGLES, hasBedDimensions } from "@/lib/cubage";

// Etapa 4: captura guiada dos 3 ângulos e análise com IA
export default function CaptureStep({ vehicle, factor, tolerance, scaleNetKg, onAnalyzed }) {
  const [photos, setPhotos] = useState({ lateral: null, diagonal: null, frontal: null });
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const bedOk = hasBedDimensions(vehicle);
  const allCaptured = photos.lateral && photos.diagonal && photos.frontal;

  const analyze = async () => {
    setAnalyzing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("analyzeCubagePhotos", {
        photos: [photos.lateral, photos.diagonal, photos.frontal],
        bed_length_m: Number(vehicle.bed_length_m),
        bed_width_m: Number(vehicle.bed_width_m),
        bed_edge_height_m: Number(vehicle.bed_edge_height_m),
        density_factor_t_m3: factor,
        scale_net_kg: scaleNetKg ?? null,
        tolerance_percent: tolerance,
      });
      if (res.data?.error) {
        setError(res.data.error);
        return;
      }
      onAnalyzed({ ...res.data, photo_urls: [photos.lateral, photos.diagonal, photos.frontal] });
    } catch (err) {
      setError("Falha na análise das fotos. Tente novamente.");
    } finally {
      setAnalyzing(false);
    }
  };

  if (!bedOk) {
    return (
      <div className="p-4 border-2 border-orange-300 bg-orange-50 rounded-xl space-y-2">
        <p className="text-sm font-semibold text-orange-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Faltam as dimensões da caçamba
        </p>
        <p className="text-sm text-orange-800">
          O caminhão <b>{vehicle.plate}</b> está cadastrado sem comprimento, largura ou altura da borda da caçamba.
          Complete o cadastro do veículo antes de cubar.
        </p>
        <Link to="/Vehicles" className="text-sm font-semibold text-orange-900 underline">
          Ir para Veículos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-3 bg-slate-100 rounded-xl text-sm text-slate-700">
        Caçamba: {vehicle.bed_length_m} m × {vehicle.bed_width_m} m · Borda: {vehicle.bed_edge_height_m} m
      </div>

      {CUBAGE_ANGLES.map((angle) => (
        <div key={angle.id} className="space-y-1.5">
          <CameraCapture
            label={angle.title}
            sublabel={angle.instruction}
            capturedUrl={photos[angle.id]}
            onCapture={(url) => setPhotos((p) => ({ ...p, [angle.id]: url }))}
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        size="lg"
        className="w-full h-12 text-base"
        disabled={!allCaptured || analyzing}
        onClick={analyze}
      >
        {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        {analyzing ? "Analisando com IA..." : "Analisar com IA"}
      </Button>
    </div>
  );
}