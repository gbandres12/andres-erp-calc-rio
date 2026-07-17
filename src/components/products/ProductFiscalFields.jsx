import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fields = [
  ["ncm", "NCM", "8 dígitos"], ["cest", "CEST", "Quando aplicável"],
  ["cfop", "CFOP padrão", "Ex.: 5102"], ["origem_mercadoria", "Origem da mercadoria", "Ex.: 0"],
  ["icms_cst", "CST ICMS", "Ex.: 00"], ["icms_aliquota", "Alíquota ICMS (%)", "0,00", "number"],
  ["pis_cst", "CST PIS", "Ex.: 01"], ["pis_aliquota", "Alíquota PIS (%)", "0,00", "number"],
  ["cofins_cst", "CST COFINS", "Ex.: 01"], ["cofins_aliquota", "Alíquota COFINS (%)", "0,00", "number"],
  ["ibs_cbs_cst", "CST IBS/CBS", "Código vigente"], ["classificacao_tributaria", "Classificação tributária", "cClassTrib"],
  ["ibs_aliquota", "Alíquota IBS (%)", "0,00", "number"], ["cbs_aliquota", "Alíquota CBS (%)", "0,00", "number"],
  ["beneficio_fiscal", "Benefício fiscal", "Código, quando aplicável"]
];

export default function ProductFiscalFields({ value, onChange }) {
  const update = (field, raw, type) => onChange(field, type === "number" ? (raw === "" ? "" : Number(raw)) : raw);
  return (
    <section className="border-t border-slate-200 pt-4">
      <h3 className="font-semibold text-slate-800 mb-1">Tributação padrão do produto</h3>
      <p className="text-xs text-slate-500 mb-4">CST e alíquotas cadastrados aqui serão preenchidos automaticamente no emissor fiscal.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(([field, label, placeholder, type]) => (
          <div key={field} className="space-y-2">
            <Label>{label}</Label>
            <Input type={type || "text"} step={type === "number" ? "0.0001" : undefined} min={type === "number" ? "0" : undefined}
              placeholder={placeholder} value={value[field] ?? ""} onChange={(e) => update(field, e.target.value, type)} />
          </div>
        ))}
      </div>
    </section>
  );
}