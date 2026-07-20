import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck } from "lucide-react";

const MODALIDADES = [
  { value: "9", label: "9 - Sem frete" },
  { value: "0", label: "0 - CIF (por conta do remetente)" },
  { value: "1", label: "1 - FOB (por conta do destinatário)" },
  { value: "2", label: "2 - Por conta de terceiros" },
  { value: "3", label: "3 - Transporte próprio (remetente)" },
  { value: "4", label: "4 - Transporte próprio (destinatário)" }
];

export default function TransportSection({ value, onChange }) {
  const t = value || {};
  const modalidade = t.modalidade_frete || "9";
  const semFrete = modalidade === "9";

  const set = (patch) => onChange({ ...t, ...patch });
  const setTransp = (field, v) => set({ transportadora: { ...(t.transportadora || {}), [field]: v } });
  const setVeiculo = (field, v) => set({ veiculo: { ...(t.veiculo || {}), [field]: v } });
  const setVolume = (field, v) => set({ volume: { ...(t.volume || {}), [field]: v } });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
        <Truck className="w-4 h-4 text-slate-500" /> Transportador / Volumes
      </h3>

      <div className="space-y-1 max-w-sm">
        <Label>Frete por Conta (Modalidade)</Label>
        <Select value={modalidade} onValueChange={v => set({ modalidade_frete: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODALIDADES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!semFrete && (
        <>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Transportadora</p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label>Nome / Razão Social</Label>
                <Input value={t.transportadora?.nome || ""} onChange={e => setTransp("nome", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>CNPJ / CPF</Label>
                <Input value={t.transportadora?.cpf_cnpj || ""} onChange={e => setTransp("cpf_cnpj", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Inscrição Estadual</Label>
                <Input value={t.transportadora?.ie || ""} onChange={e => setTransp("ie", e.target.value)} placeholder="ou ISENTO" />
              </div>
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input value={t.transportadora?.endereco || ""} onChange={e => setTransp("endereco", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label>Município</Label>
                  <Input value={t.transportadora?.cidade || ""} onChange={e => setTransp("cidade", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>UF</Label>
                  <Input maxLength={2} value={t.transportadora?.uf || ""} onChange={e => setTransp("uf", e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Veículo</p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Placa</Label>
                <Input value={t.veiculo?.placa || ""} onChange={e => setVeiculo("placa", e.target.value.toUpperCase())} placeholder="ABC1D23" />
              </div>
              <div className="space-y-1">
                <Label>UF do Veículo</Label>
                <Input maxLength={2} value={t.veiculo?.uf || ""} onChange={e => setVeiculo("uf", e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1">
                <Label>Código ANTT (RNTC)</Label>
                <Input value={t.veiculo?.rntc || ""} onChange={e => setVeiculo("rntc", e.target.value)} />
              </div>
            </div>
          </div>
        </>
      )}

      <div>
        <p className="text-sm font-medium text-slate-600 mb-2">Volumes Transportados (opcional)</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="space-y-1">
            <Label>Quantidade</Label>
            <Input type="number" min="0" value={t.volume?.quantidade ?? ""} onChange={e => setVolume("quantidade", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Espécie</Label>
            <Input value={t.volume?.especie || ""} onChange={e => setVolume("especie", e.target.value)} placeholder="GRANEL, SACO..." />
          </div>
          <div className="space-y-1">
            <Label>Marca</Label>
            <Input value={t.volume?.marca || ""} onChange={e => setVolume("marca", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Numeração</Label>
            <Input value={t.volume?.numeracao || ""} onChange={e => setVolume("numeracao", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Peso Bruto (kg)</Label>
            <Input type="number" min="0" step="0.001" value={t.volume?.peso_bruto ?? ""} onChange={e => setVolume("peso_bruto", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Peso Líquido (kg)</Label>
            <Input type="number" min="0" step="0.001" value={t.volume?.peso_liquido ?? ""} onChange={e => setVolume("peso_liquido", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}