import React, { useState, useEffect } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CameraCapture from "@/components/cubage/CameraCapture";
import { normalizePlate } from "@/lib/cubage";

// Etapa 2: cadastro único motorista+caminhão — IA extrai os documentos das fotos
export default function DriverRegisterStep({ companyId, initialPlate, onSaved }) {
  const [cnhUrl, setCnhUrl] = useState(null);
  const [truckUrl, setTruckUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    driver_name: "",
    driver_cpf: "",
    cnh_number: "",
    cnh_category: "",
    cnh_valid_until: "",
    plate: normalizePlate(initialPlate),
    bed_length_m: "",
    bed_width_m: "",
    bed_edge_height_m: "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Quando as duas fotos chegam, extrai os dados com IA
  useEffect(() => {
    if (!cnhUrl || !truckUrl || extracting) return;
    let cancelled = false;
    (async () => {
      setExtracting(true);
      try {
        const res = await base44.functions.invoke("readVehicleDocuments", {
          cnh_photo_url: cnhUrl,
          truck_photo_url: truckUrl,
        });
        const d = res.data || {};
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          driver_name: d.driver_name || f.driver_name,
          driver_cpf: d.driver_cpf || f.driver_cpf,
          cnh_number: d.cnh_number || f.cnh_number,
          cnh_category: d.cnh_category || f.cnh_category,
          cnh_valid_until: d.cnh_valid_until || f.cnh_valid_until,
          plate: normalizePlate(d.plate || f.plate),
        }));
      } finally {
        if (!cancelled) setExtracting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cnhUrl, truckUrl]);

  const canSave =
    form.driver_name && normalizePlate(form.plate) &&
    Number(form.bed_length_m) > 0 && Number(form.bed_width_m) > 0 && Number(form.bed_edge_height_m) > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const plate = normalizePlate(form.plate);
      const vehicle = await base44.entities.Vehicle.create({
        code: `VEI-${plate}`,
        plate,
        driver_name: form.driver_name.trim(),
        driver_cpf: form.driver_cpf.replace(/\D/g, ""),
        driver_license: form.cnh_number.trim(),
        cnh_category: form.cnh_category.toUpperCase().trim(),
        cnh_valid_until: form.cnh_valid_until || undefined,
        cnh_photo_url: cnhUrl,
        truck_photo_url: truckUrl,
        bed_length_m: parseFloat(form.bed_length_m),
        bed_width_m: parseFloat(form.bed_width_m),
        bed_edge_height_m: parseFloat(form.bed_edge_height_m),
        fleet_type: "agregada",
        status: "ativo",
        company_id: companyId,
      });
      onSaved(vehicle);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <CameraCapture
        label="Fotografar a CNH do motorista"
        sublabel="A IA extrai nome, CPF, nº e categoria"
        capturedUrl={cnhUrl}
        onCapture={setCnhUrl}
      />
      <CameraCapture
        label="Fotografar o caminhão"
        sublabel="A IA lê a placa e guarda a foto"
        capturedUrl={truckUrl}
        onCapture={setTruckUrl}
      />

      {extracting && (
        <p className="text-sm text-violet-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Lendo os documentos com IA...
        </p>
      )}

      {(cnhUrl || truckUrl) && (
        <div className="space-y-4 p-4 border rounded-xl bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome do motorista *</Label>
              <Input value={form.driver_name} onChange={set("driver_name")} className="h-11 border-2" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.driver_cpf} onChange={set("driver_cpf")} className="h-11 border-2" />
            </div>
            <div>
              <Label>CNH nº</Label>
              <Input value={form.cnh_number} onChange={set("cnh_number")} className="h-11 border-2" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input value={form.cnh_category} onChange={set("cnh_category")} placeholder="C, D, E..." className="h-11 border-2" />
            </div>
            <div>
              <Label>Validade CNH</Label>
              <Input type="date" value={form.cnh_valid_until} onChange={set("cnh_valid_until")} className="h-11 border-2" />
            </div>
            <div className="col-span-2">
              <Label>Placa *</Label>
              <Input
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                className="h-11 border-2 font-bold tracking-widest"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-slate-800 mb-2">Dimensões internas da caçamba (metros)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Comprimento *</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={form.bed_length_m} onChange={set("bed_length_m")} placeholder="6.2" className="h-11 border-2" />
              </div>
              <div>
                <Label>Largura *</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={form.bed_width_m} onChange={set("bed_width_m")} placeholder="2.3" className="h-11 border-2" />
              </div>
              <div>
                <Label>Altura da borda *</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={form.bed_edge_height_m} onChange={set("bed_edge_height_m")} placeholder="1.2" className="h-11 border-2" />
              </div>
            </div>
          </div>

          <Button size="lg" className="w-full h-12 text-base" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salvar cadastro
          </Button>
        </div>
      )}
    </div>
  );
}