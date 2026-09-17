import React, { useState } from "react";
import { Search, Loader2, Camera, UserX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CameraCapture from "@/components/cubage/CameraCapture";
import { normalizePlate, findVehicleByPlate } from "@/lib/cubage";

// Etapa 1: identificar o motorista/caminhão pela placa (digitada ou fotografada)
export default function IdentifyStep({ companyId, plate, setPlate, onFound, onRegister }) {
  const [searching, setSearching] = useState(false);
  const [readingPlate, setReadingPlate] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [platePhoto, setPlatePhoto] = useState(null);

  const search = async (value) => {
    const norm = normalizePlate(value);
    if (!norm) return;
    setSearching(true);
    setNotFound(false);
    try {
      const vehicle = await findVehicleByPlate(norm, companyId);
      if (vehicle) onFound(vehicle);
      else setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const handlePlatePhoto = async (url) => {
    setPlatePhoto(url);
    setReadingPlate(true);
    try {
      const { base44 } = await import("@/api/base44Client");
      const res = await base44.functions.invoke("readVehicleDocuments", { plate_photo_url: url });
      const read = res.data?.plate || "";
      if (read) {
        setPlate(read);
        await search(read);
      } else {
        setNotFound(true);
      }
    } finally {
      setReadingPlate(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-600 mb-3">
          Digite a placa do caminhão ou fotografe a placa para encontrar o motorista cadastrado.
        </p>
        <div className="flex gap-2">
          <Input
            value={plate}
            onChange={(e) => { setPlate(e.target.value.toUpperCase()); setNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && search(plate)}
            placeholder="ABC1D23"
            className="text-lg font-bold tracking-widest h-12 border-2"
          />
          <Button
            size="lg"
            className="h-12 px-5"
            disabled={searching || !normalizePlate(plate)}
            onClick={() => search(plate)}
          >
            {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Buscar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
        <div className="flex-1 border-t" /> ou <div className="flex-1 border-t" />
      </div>

      <CameraCapture
        label="Fotografar a placa"
        sublabel="A IA lê a placa e busca o motorista"
        capturedUrl={platePhoto}
        onCapture={handlePlatePhoto}
      />
      {readingPlate && (
        <p className="text-sm text-violet-700 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo a placa com IA...
        </p>
      )}

      {notFound && (
        <div className="p-4 border-2 border-orange-300 bg-orange-50 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-orange-900 flex items-center gap-2">
            <UserX className="w-5 h-5" /> Motorista/caminhão não cadastrado
          </p>
          <Button size="lg" className="w-full h-12 text-base" onClick={onRegister}>
            <Camera className="w-5 h-5" /> Cadastrar agora
          </Button>
        </div>
      )}
    </div>
  );
}