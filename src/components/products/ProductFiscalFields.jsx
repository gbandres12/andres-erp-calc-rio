import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ProductFiscalApproval from "@/components/products/ProductFiscalApproval";

const fields = [
  ["fiscal_description", "Descrição fiscal", "Descrição usada na nota"],
  ["ncm", "NCM", "8 dígitos"], ["cest", "CEST", "Quando aplicável"],
  ["cfop_internal", "CFOP interno", "Ex.: 5102"], ["cfop_interstate", "CFOP interestadual", "Ex.: 6102"],
  ["origem_mercadoria", "Origem da mercadoria", "Ex.: 0"], ["icms_cst", "CST ICMS", "CRT 2 ou 3"],
  ["icms_csosn", "CSOSN", "Somente CRT 1"], ["icms_aliquota", "Alíquota ICMS (%)", "0,00", "number"],
  ["pis_cst", "CST PIS", "Ex.: 01"], ["pis_aliquota", "Alíquota PIS (%)", "0,00", "number"],
  ["cofins_cst", "CST COFINS", "Ex.: 01"], ["cofins_aliquota", "Alíquota COFINS (%)", "0,00", "number"],
  ["ibs_cbs_cst", "CST IBS/CBS", "Código vigente"], ["classificacao_tributaria", "cClassTrib IBS/CBS", "Código vigente"],
  ["ibs_aliquota", "Alíquota IBS (%)", "0,00", "number"], ["cbs_aliquota", "Alíquota CBS (%)", "0,00", "number"],
  ["fundamento_legal", "Fundamento legal", "Base legal da tributação"], ["observacao_fiscal", "Observação fiscal", "Orientação da contabilidade"]
];

const configuredFlags = {
  icms_aliquota: "icms_aliquota_configurada", pis_aliquota: "pis_aliquota_configurada",
  cofins_aliquota: "cofins_aliquota_configurada", ibs_aliquota: "ibs_aliquota_configurada",
  cbs_aliquota: "cbs_aliquota_configurada"
};

export default function ProductFiscalFields({ value, onChange }) {
  const update = (field, raw, type) => {
    onChange(field, type === "number" ? (raw === "" ? "" : Number(raw)) : raw);
    if (type === "number") onChange(configuredFlags[field], raw !== "");
  };
  return (
    <section className="border-t border-slate-200 pt-4">
      <h3 className="font-semibold text-slate-800 mb-1">Tributação padrão do produto</h3>
      <p className="text-xs text-slate-500 mb-4">CST e alíquotas cadastrados aqui serão preenchidos automaticamente no emissor fiscal.</p>
      <ProductFiscalApproval value={value} onChange={onChange} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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