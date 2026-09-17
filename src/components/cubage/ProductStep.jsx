import React from "react";
import { ArrowRight, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const PURPOSES = [
  { value: "saida_venda", label: "Saída para venda" },
  { value: "entrada_estoque", label: "Entrada de estoque" },
  { value: "transferencia_saida", label: "Transferência (saída)" },
  { value: "transferencia_entrada", label: "Transferência (entrada)" },
  { value: "outros", label: "Outros" },
];

// Etapa 3: produto + fator t/m³ (+ finalidade, quando não há balança)
export default function ProductStep({
  products, product, setProduct, factor, setFactor, wetFactor, setWetFactor,
  standalone, purpose, setPurpose, origin, setOrigin, destination, setDestination, onContinue,
}) {
  const wetAvailable = Boolean(product?.density_wet_t_m3);

  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-1.5 block">Produto transportado *</Label>
        <Select value={product?.id || ""} onValueChange={(id) => setProduct(products.find((p) => p.id === id) || null)}>
          <SelectTrigger className="h-12 text-base border-2 font-medium">
            <SelectValue placeholder="Selecione o produto" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1.5 block">Fator de conversão (t/m³) *</Label>
        <Input
          type="number"
          step="0.05"
          inputMode="decimal"
          value={factor ?? ""}
          onChange={(e) => setFactor(e.target.value === "" ? null : parseFloat(e.target.value))}
          className="h-12 text-lg font-bold border-2"
        />
        <p className="text-xs text-slate-500 mt-1">
          {product
            ? wetAvailable && wetFactor
              ? `Fator do produto úmido (${product.name})`
              : `Fator cadastrado no produto (${product.name})`
            : "Fator padrão da filial — ajuste se necessário"}
        </p>
      </div>

      {wetAvailable && (
        <div className="flex items-center justify-between p-3 border-2 border-sky-200 bg-sky-50 rounded-xl">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-sky-600" />
            <div>
              <p className="text-sm font-semibold text-sky-900">Pó úmido</p>
              <p className="text-xs text-sky-700">Usa o fator {product.density_wet_t_m3} t/m³</p>
            </div>
          </div>
          <Switch checked={wetFactor} onCheckedChange={setWetFactor} />
        </div>
      )}

      {standalone && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <Label className="mb-1.5 block">Finalidade *</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger className="h-12 border-2 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURPOSES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origem</Label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Pátio" className="h-11 border-2" />
            </div>
            <div>
              <Label>Destino</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Fazenda..." className="h-11 border-2" />
            </div>
          </div>
        </div>
      )}

      <Button size="lg" className="w-full h-12 text-base" disabled={!product || !factor || factor <= 0} onClick={onContinue}>
        Continuar <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
}