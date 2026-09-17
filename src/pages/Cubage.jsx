import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Ruler, Settings2, CheckCircle2, RotateCcw, Scale } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import BranchBadge from "@/components/BranchBadge";
import useSelectedCompanyId from "@/hooks/useSelectedCompanyId";
import { findVehicleByPlate, normalizePlate } from "@/lib/cubage";
import IdentifyStep from "@/components/cubage/IdentifyStep";
import DriverRegisterStep from "@/components/cubage/DriverRegisterStep";
import ProductStep from "@/components/cubage/ProductStep";
import CaptureStep from "@/components/cubage/CaptureStep";
import ResultStep from "@/components/cubage/ResultStep";
import CubageConfigDialog from "@/components/cubage/CubageConfigDialog";

const STEPS = ["Motorista", "Produto", "Fotos", "Resultado"];

export default function Cubage() {
  const companyId = useSelectedCompanyId();
  const [urlParams] = useSearchParams();
  const weighingId = urlParams.get("weighing_id");
  const mode = weighingId ? "conference" : "standalone";
  const queryClient = useQueryClient();

  const [step, setStep] = useState("identify");
  const [plate, setPlate] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [product, setProduct] = useState(null);
  const [factorOverride, setFactorOverride] = useState(null);
  const [wetFactor, setWetFactor] = useState(false);
  const [purpose, setPurpose] = useState("saida_venda");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedRef, setSavedRef] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const autoDone = useRef(false);

  const { data: user } = useQuery({
    queryKey: ["cubageMe"],
    queryFn: () => base44.auth.me(),
  });
  const isAdmin = user?.role === "admin" || user?.custom_role === "admin";

  const { data: products = [] } = useQuery({
    queryKey: ["cubageProducts", companyId],
    queryFn: () => base44.entities.Product.filter({ company_id: companyId, is_active: true }, "name", 200),
    enabled: !!companyId,
  });

  const { data: cubageConfigs = [] } = useQuery({
    queryKey: ["cubageConfig", companyId],
    queryFn: () => base44.entities.CubageConfig.filter({ company_id: companyId }),
    enabled: !!companyId,
  });
  const config = cubageConfigs[0] || { tolerance_percent: 5, default_factor_t_m3: 1.5 };

  const { data: conferenceWeighing } = useQuery({
    queryKey: ["cubageWeighing", weighingId],
    queryFn: () => base44.entities.Weighing.get(weighingId),
    enabled: !!weighingId,
  });

  // Modo conferência: busca o veículo pela placa da pesagem e vai direto ao produto
  useEffect(() => {
    if (!conferenceWeighing || autoDone.current || !companyId) return;
    autoDone.current = true;
    const w = conferenceWeighing;
    setPlate(normalizePlate(w.vehicle_plate));
    (async () => {
      const v = await findVehicleByPlate(w.vehicle_plate, companyId);
      if (v) setVehicle(v);
      setStep("product");
    })();
  }, [conferenceWeighing, companyId]);

  // Modo conferência: pré-seleciona o produto pelo nome da pesagem
  useEffect(() => {
    if (!conferenceWeighing || !products.length) return;
    const match = products.find((p) => p.name === conferenceWeighing.product);
    if (match) setProduct(match);
  }, [products, conferenceWeighing]);

  const factor = useMemo(() => {
    if (factorOverride != null) return factorOverride;
    if (!product) return config.default_factor_t_m3;
    if (wetFactor && product.density_wet_t_m3) return product.density_wet_t_m3;
    return product.density_t_m3 ?? config.default_factor_t_m3;
  }, [product, wetFactor, factorOverride, config]);

  const resetFactor = () => setFactorOverride(null);

  const handleVehicleFound = (v) => {
    setVehicle(v);
    setStep("product");
  };

  const handleAnalyzed = (a) => {
    setAnalysis(a);
    setStep("result");
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const cubageFields = {
        cubage_method: "foto_ia",
        cubage_height_m: analysis.estimated_height_m,
        cubage_volume_m3: analysis.volume_m3,
        cubage_factor_t_m3: factor,
        cubage_estimated_tons: analysis.estimated_tons,
        cubage_margin_percent: analysis.margin_percent,
        cubage_diff_percent: analysis.diff_percent ?? null,
        cubage_alert: Boolean(analysis.alert),
        cubage_photos: analysis.photo_urls || [],
        cubage_date: new Date().toISOString(),
        cubage_operator: user?.full_name || "",
        cubage_product_name: product?.name || "",
        cubage_notes: `Forma: ${analysis.load_shape || "—"}. Confiança: ${analysis.confidence}.`,
      };

      if (mode === "conference" && conferenceWeighing) {
        await base44.entities.Weighing.update(conferenceWeighing.id, cubageFields);
        setSavedRef(conferenceWeighing.reference);
      } else {
        const netKg = Math.round(analysis.estimated_tons * 1000);
        const last = await base44.entities.Weighing.list("-reference", 1);
        const lastRef = last[0]?.reference || "VG000000";
        const newRef = `VG${String(parseInt(lastRef.replace("VG", "")) + 1).padStart(6, "0")}`;
        const created = await base44.entities.Weighing.create({
          reference: newRef,
          vehicle_id: vehicle.id,
          vehicle_plate: normalizePlate(vehicle.plate),
          driver_name: vehicle.driver_name || "",
          product: product?.name || "",
          origin, destination, purpose,
          operator: user?.full_name || "",
          company_id: companyId,
          net: netKg,
          net_tons: analysis.estimated_tons,
          weight_source: "cubagem",
          status: "concluida",
          gross_datetime: new Date().toISOString(),
          tare_datetime: new Date().toISOString(),
          ...cubageFields,
        });
        setSavedRef(created.reference);
      }
      queryClient.invalidateQueries(["weighings"]);
      setStep("done");
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setStep("identify");
    setPlate("");
    setVehicle(null);
    setProduct(null);
    setFactorOverride(null);
    setWetFactor(false);
    setAnalysis(null);
    setSavedRef(null);
    autoDone.current = mode === "standalone";
  };

  const stepIndex = { identify: 0, register: 0, product: 1, capture: 2, result: 3, done: 3 }[step];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-5 pb-16">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Ruler className="w-6 h-6 text-violet-600" /> Cubagem
          </h1>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <Settings2 className="w-4 h-4" /> Config
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <BranchBadge />
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
            {mode === "conference" ? "Conferência com balança" : "Pesagem sem balança"}
          </span>
        </div>

        {step !== "done" && (
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <span className={`text-[11px] font-semibold ${i <= stepIndex ? "text-violet-700" : "text-slate-400"}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className={`flex-1 h-0.5 rounded ${i < stepIndex ? "bg-violet-500" : "bg-slate-200"}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        {step === "identify" && (
          <IdentifyStep
            companyId={companyId}
            plate={plate}
            setPlate={setPlate}
            onFound={handleVehicleFound}
            onRegister={() => setStep("register")}
          />
        )}

        {step === "register" && (
          <DriverRegisterStep
            companyId={companyId}
            initialPlate={plate}
            onSaved={handleVehicleFound}
          />
        )}

        {step === "product" && (
          <ProductStep
            products={products}
            product={product}
            setProduct={(p) => { setProduct(p); setWetFactor(false); resetFactor(); }}
            factor={factor}
            setFactor={setFactorOverride}
            wetFactor={wetFactor}
            setWetFactor={setWetFactor}
            standalone={mode === "standalone"}
            purpose={purpose}
            setPurpose={setPurpose}
            origin={origin}
            setOrigin={setOrigin}
            destination={destination}
            setDestination={setDestination}
            onContinue={() => setStep("capture")}
          />
        )}

        {step === "capture" && vehicle && (
          <CaptureStep
            vehicle={vehicle}
            factor={factor}
            tolerance={config.tolerance_percent}
            scaleNetKg={mode === "conference" ? conferenceWeighing?.net : null}
            onAnalyzed={handleAnalyzed}
          />
        )}

        {step === "result" && analysis && (
          <ResultStep
            analysis={analysis}
            vehicle={vehicle}
            product={product}
            factor={factor}
            mode={mode}
            scaleNetKg={mode === "conference" ? conferenceWeighing?.net : null}
            tolerance={config.tolerance_percent}
            saving={saving}
            onConfirm={handleConfirm}
            onRetryPhotos={() => { setAnalysis(null); setStep("capture"); }}
          />
        )}

        {step === "done" && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-bold text-slate-900">Cubagem registrada!</p>
              <p className="text-sm text-slate-600">
                {mode === "conference"
                  ? `Conferência gravada na pesagem ${savedRef}`
                  : `Pesagem ${savedRef} criada com peso estimado`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild size="lg" className="h-12 text-base">
                <Link to="/Weighing"><Scale className="w-5 h-5" /> Ver pesagens</Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12" onClick={restart}>
                <RotateCcw className="w-4 h-4" /> Nova cubagem
              </Button>
            </div>
          </div>
        )}
      </div>

      <CubageConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        companyId={companyId}
        products={products}
      />
    </div>
  );
}