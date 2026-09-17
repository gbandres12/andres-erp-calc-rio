import React, { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Config da cubagem: tolerância × balança, fator padrão e fatores por produto
export default function CubageConfigDialog({ open, onOpenChange, companyId, products }) {
  const [config, setConfig] = useState({ tolerance_percent: 5, default_factor_t_m3: 1.5 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [product, setProduct] = useState(null);
  const [density, setDensity] = useState("");
  const [densityWet, setDensityWet] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    (async () => {
      const list = await base44.entities.CubageConfig.filter({ company_id: companyId });
      if (list[0]) setConfig(list[0]);
    })();
  }, [open, companyId]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const existing = await base44.entities.CubageConfig.filter({ company_id: companyId });
      if (existing[0]) {
        await base44.entities.CubageConfig.update(existing[0].id, config);
      } else {
        await base44.entities.CubageConfig.create({ ...config, company_id: companyId });
      }
      onOpenChange(false);
    } finally {
      setSavingConfig(false);
    }
  };

  const selectProduct = (id) => {
    const p = products.find((x) => x.id === id) || null;
    setProduct(p);
    setDensity(p?.density_t_m3 ?? "");
    setDensityWet(p?.density_wet_t_m3 ?? "");
  };

  const saveProduct = async () => {
    if (!product) return;
    setSavingProduct(true);
    try {
      await base44.entities.Product.update(product.id, {
        density_t_m3: density === "" ? null : parseFloat(density),
        density_wet_t_m3: densityWet === "" ? null : parseFloat(densityWet),
      });
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de Cubagem</DialogTitle>
          <DialogDescription>Tolerâncias e fatores t/m³ usados na cubagem por foto</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tolerância vs balança (%)</Label>
              <Input
                type="number" min="1" step="1" inputMode="decimal"
                value={config.tolerance_percent}
                onChange={(e) => setConfig((c) => ({ ...c, tolerance_percent: parseFloat(e.target.value) }))}
                className="h-11 border-2"
              />
            </div>
            <div>
              <Label>Fator padrão (t/m³)</Label>
              <Input
                type="number" step="0.05" inputMode="decimal"
                value={config.default_factor_t_m3}
                onChange={(e) => setConfig((c) => ({ ...c, default_factor_t_m3: parseFloat(e.target.value) }))}
                className="h-11 border-2"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <Label>Fator por produto</Label>
            <Select value={product?.id || ""} onValueChange={selectProduct}>
              <SelectTrigger className="h-11 border-2">
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Densidade (t/m³)</Label>
                  <Input type="number" step="0.05" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} className="h-11 border-2" />
                </div>
                <div>
                  <Label>Pó úmido (t/m³)</Label>
                  <Input type="number" step="0.05" inputMode="decimal" value={densityWet} onChange={(e) => setDensityWet(e.target.value)} className="h-11 border-2" />
                </div>
              </div>
            )}
            <Button variant="outline" className="w-full" disabled={!product || savingProduct} onClick={saveProduct}>
              {savingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar fator do produto
            </Button>
          </div>

          <Button className="w-full h-11" disabled={savingConfig} onClick={saveConfig}>
            {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configurações da filial
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}