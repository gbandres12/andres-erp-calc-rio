import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const classifications = [
  ["tributada_integralmente", "Tributada integralmente"], ["isenta", "Isenta"],
  ["nao_tributada", "Não tributada"], ["diferida", "Diferida"],
  ["suspensa", "Suspensa"], ["icms_cobrado_anteriormente", "ICMS cobrado anteriormente"],
  ["substituicao_tributaria", "Substituição tributária"], ["outra", "Outra"]
];

export default function ProductFiscalApproval({ value, onChange }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div className="space-y-2"><Label>Classificação fiscal *</Label>
      <Select value={value.tax_classification || ""} onValueChange={v => onChange("tax_classification", v)}>
        <SelectTrigger><SelectValue placeholder="Selecione a regra" /></SelectTrigger>
        <SelectContent>{classifications.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="space-y-2"><Label>Última revisão fiscal *</Label>
      <Input type="date" value={value.fiscal_review_date || ""} onChange={e => onChange("fiscal_review_date", e.target.value)} />
    </div>
    <label className="sm:col-span-2 flex items-center gap-3 text-sm font-medium text-slate-800">
      <Checkbox checked={!!value.accountant_approved} onCheckedChange={v => onChange("accountant_approved", v === true)} />
      Regra fiscal revisada e aprovada pelo contador
    </label>
  </div>;
}