import React, { useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { uploadPhoto } from "@/lib/cubage";

// Captura de foto pela câmera do celular, com compressão antes do upload
export default function CameraCapture({ label, sublabel, onCapture, capturedUrl, small }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const url = await uploadPhoto(file);
      onCapture(url);
    } catch (err) {
      setError("Falha ao enviar a foto. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (capturedUrl) {
    return (
      <div className="flex items-center gap-3 p-3 border-2 border-green-300 bg-green-50 rounded-xl">
        <img src={capturedUrl} alt={label} className="w-16 h-16 rounded-lg object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800 truncate">{label}</p>
          <p className="text-xs text-green-700">Foto capturada</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs font-semibold text-green-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-green-100"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refazer
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className={`w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-violet-300 bg-white text-violet-800 font-semibold hover:bg-violet-50 transition-colors disabled:opacity-60 ${
          small ? "p-3 text-sm" : "p-4 text-base"
        }`}
      >
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin flex-shrink-0" />
        ) : (
          <Camera className="w-6 h-6 flex-shrink-0" />
        )}
        <span className="text-left">
          {loading ? "Enviando foto..." : label}
          {sublabel && !loading && (
            <span className="block text-xs font-normal text-slate-500">{sublabel}</span>
          )}
        </span>
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}