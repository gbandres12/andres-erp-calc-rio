import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  RefreshCw, Search, Wheat, CheckCircle2, Truck, Package, Link2,
  ChevronDown, Camera, Clock, User, FileText
} from "lucide-react";
import { toast } from "sonner";
import BranchBadge from "@/components/BranchBadge";
import { applyWithdrawal, kgToUnit } from "@/utils/saleWithdrawal";

const EMPTY_FORM = {
  vehicle_id: "avulso",
  vehicle_plate: "",
  vehicle_plate2: "",
  vehicle_plate3: "",
  driver_name: "",
  transporter: "",
  product: "",
  origin: "",
  destination: "",
  tare: 0,
  gross: 0,
  entry_time: "",
  exit_time: "",
  operator: "",
  client_id: "",
  sale_id: "",
  barter_id: "",
  barge_name: "",
  purchase_order_id: "",
  notes: "",
  purpose: "saida_venda",
  ticket_number: "",
  apply_withdrawal: true
};

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900 leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 leading-tight">{subtitle}</p>}
      </div>
    </div>
  );
}

function nowLocalDateTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function WeighingFormDialog({
  open, onOpenChange, vehicles = [], contacts = [], sales = [],
  purchaseOrders = [], selectedCompanyId, selectedCompany
}) {
  const queryClient = useQueryClient();
  const [currentWeight, setCurrentWeight] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [saleSearchTerm, setSaleSearchTerm] = useState("");
  const [poSearchTerm, setPoSearchTerm] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [barterSearch, setBarterSearch] = useState("");
  const [weightUnit, setWeightUnit] = useState("ton");
  const [showOptional, setShowOptional] = useState(false);
  const [productFocused, setProductFocused] = useState(false);
  const tareInputRef = useRef(null);
  const grossInputRef = useRef(null);

  // Pre-fill operator & timestamps on open
  useEffect(() => {
    if (open) {
      base44.auth.me().then(u => {
        setFormData(prev => ({ ...prev, operator: u?.full_name || prev.operator }));
      }).catch(() => {});
    }
  }, [open]);

  // Balança ao vivo
  const { data: scaleState = [] } = useQuery({
    queryKey: ['scaleState', selectedCompanyId],
    queryFn: () => base44.entities.ScaleState.filter({ company_id: selectedCompanyId }),
    refetchInterval: 2000,
    enabled: open && !!selectedCompanyId
  });
  const liveWeight = scaleState[0]?.current_weight || 0;
  const lastUpdate = scaleState[0]?.last_update;
  const isScaleActive = lastUpdate && (new Date() - new Date(lastUpdate)) < 30000;

  useEffect(() => {
    if (isScaleActive) { setCurrentWeight(liveWeight); setIsConnected(true); }
    else setIsConnected(false);
  }, [liveWeight, isScaleActive]);

  // Permutas em aberto
  const { data: barters = [] } = useQuery({
    queryKey: ['bartersWeighing', selectedCompanyId],
    queryFn: () => base44.entities.Barter.filter({ company_id: selectedCompanyId, status: { $in: ['aberto', 'parcial'] } }, '-created_date'),
    enabled: open && !!selectedCompanyId
  });

  // Motoristas cadastrados
  const drivers = useMemo(() => {
    const map = new Map();
    vehicles.forEach(v => {
      if (v.driver_name) {
        const key = v.driver_name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: v.driver_name, cpf: v.driver_cpf, license: v.driver_license,
            category: v.cnh_category, vehicleId: v.id, plate: v.plate, brand: v.brand,
            transporter: v.brand
          });
        }
      }
    });
    return Array.from(map.values());
  }, [vehicles]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return drivers.slice(0, 8);
    const q = driverSearch.toLowerCase();
    return drivers.filter(d =>
      d.name.toLowerCase().includes(q) || (d.cpf && d.cpf.includes(q)) || (d.plate && d.plate.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [drivers, driverSearch]);

  // Sugestões de produto (de vendas recentes + permutas)
  const productSuggestions = useMemo(() => {
    const set = new Set();
    sales.forEach(s => s.items?.forEach(i => i.product_name && set.add(i.product_name)));
    return Array.from(set).slice(0, 6);
  }, [sales]);

  const selectedSale = useMemo(
    () => sales.find(s => s.id === formData.sale_id),
    [sales, formData.sale_id]
  );

  const targetItem = useMemo(() => {
    if (!selectedSale?.items?.length) return null;
    const byProduct = selectedSale.items.find(i =>
      formData.product && i.product_name?.toLowerCase().includes(formData.product.toLowerCase())
    );
    if (byProduct) return byProduct;
    return selectedSale.items.find(i => ((i.quantity || 0) - (i.quantity_withdrawn || 0)) > 0.001) || null;
  }, [selectedSale, formData.product]);

  const liveDeduction = useMemo(() => {
    if (!targetItem) return null;
    const netKg = (formData.gross || 0) - (formData.tare || 0);
    if (netKg <= 0) return { pending: 0, applied: 0, remainingAfter: 0, unit: targetItem.unit || "TON", qty: 0 };
    const targetUnit = targetItem.unit || "TON";
    const qty = kgToUnit(netKg, targetUnit);
    const pending = (targetItem.quantity || 0) - (targetItem.quantity_withdrawn || 0);
    const applied = Math.min(qty, pending);
    const remainingAfter = Math.max(0, pending - applied);
    return { pending, applied, remainingAfter, unit: targetUnit, qty };
  }, [targetItem, formData.gross, formData.tare]);

  const selectedBarter = useMemo(
    () => barters.find(b => b.id === formData.barter_id),
    [barters, formData.barter_id]
  );
  const isCornEntry = useMemo(() => /milho/i.test(formData.product), [formData.product]);

  const liveBarter = useMemo(() => {
    if (!selectedBarter) return null;
    const netKg = Math.max(0, (formData.gross || 0) - (formData.tare || 0));
    const netTons = netKg / 1000;
    const cornTonsAfter = (selectedBarter.corn_tons || 0) + netTons;
    const cornValue = cornTonsAfter * (selectedBarter.corn_unit_value || 0);
    const limestoneValue = (selectedBarter.limestone_tons || 0) * (selectedBarter.limestone_unit_value || 0);
    const balance = limestoneValue - cornValue;
    return { netTons, cornTonsAfter, cornValue, limestoneValue, balance };
  }, [selectedBarter, formData.gross, formData.tare]);

  // Reset ao abrir + smart defaults
  useEffect(() => {
    if (open) {
      setFormData({
        ...EMPTY_FORM,
        entry_time: nowLocalDateTime(),
        exit_time: nowLocalDateTime(),
        operator: ""
      });
      setSearchTerm(""); setSaleSearchTerm(""); setPoSearchTerm("");
      setDriverSearch(""); setBarterSearch("");
      setShowOptional(false);
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastWeighing = await base44.entities.Weighing.list('-reference', 1);
      const lastRef = lastWeighing[0]?.reference || 'VG000000';
      const nextNumber = parseInt(lastRef.replace('VG', '')) + 1;
      const newRef = `VG${String(nextNumber).padStart(6, '0')}`;
      const ticket = data.ticket_number || `TCK-${Date.now().toString().slice(-6)}`;
      const net = data.gross - data.tare;
      const netTon = net / 1000;

      let plateToUse = data.vehicle_plate;
      if (data.vehicle_id && data.vehicle_id !== 'avulso') {
        const v = vehicles.find(v => v.id === data.vehicle_id);
        if (v) plateToUse = v.plate;
      }
      const clientName = data.client_id ? contacts.find(c => c.id === data.client_id)?.name || '' : '';

      const created = await base44.entities.Weighing.create({
        ...data,
        reference: newRef,
        ticket_number: ticket,
        vehicle_plate: plateToUse.toUpperCase(),
        client_name: clientName,
        company_id: selectedCompanyId,
        net,
        net_tons: netTon,
        tare_datetime: data.entry_time || new Date().toISOString(),
        gross_datetime: data.exit_time || new Date().toISOString(),
        status: data.gross > 0 ? 'concluida' : 'aguardando_bruto'
      });

      let withdrawal = null, withdrawalError = null;
      if (data.apply_withdrawal && data.purpose === 'saida_venda' && data.sale_id && net > 0) {
        try {
          withdrawal = await applyWithdrawal(base44, {
            saleId: data.sale_id,
            productName: data.product,
            quantityKg: net,
            withdrawalDate: created.gross_datetime,
            responsible: data.operator,
            vehiclePlate: plateToUse.toUpperCase(),
            weighingId: created.id,
            notes: `Retirada automática via pesagem ${created.reference}`
          });
        } catch (e) {
          withdrawalError = e.message;
        }
      }

      let barterUpdated = null;
      if (data.barter_id && net > 0) {
        try {
          const barter = await base44.entities.Barter.get(data.barter_id);
          const newCornTons = (barter.corn_tons || 0) + netTon;
          const cornValue = newCornTons * (barter.corn_unit_value || 0);
          const limestoneValue = (barter.limestone_tons || 0) * (barter.limestone_unit_value || 0);
          const status = Math.abs(limestoneValue - cornValue) < 0.01 ? 'compensado' : 'parcial';
          await base44.entities.Barter.update(barter.id, { corn_tons: newCornTons, status });
          barterUpdated = { reference: barter.reference, newCornTons, status };
        } catch (e) {
          console.error("Falha ao atualizar permuta:", e);
        }
      }

      return { weighing: created, withdrawal, withdrawalError, barterUpdated };
    },
    onSuccess: ({ withdrawal, withdrawalError, barterUpdated }) => {
      queryClient.invalidateQueries(['weighings']);
      queryClient.invalidateQueries(['sales']);
      queryClient.invalidateQueries(['bartersWeighing']);
      queryClient.invalidateQueries(['receivableSales']);
      onOpenChange(false);
      toast.success("Pesagem registrada com sucesso!");
      if (withdrawal) {
        toast.info(`Retirada aplicada na venda ${withdrawal.saleRef} (${withdrawal.withdrawal_status === 'total' ? 'retirada total' : 'retirada parcial'}).`);
      } else if (withdrawalError) {
        toast.warning(`A pesagem foi registrada, mas a baixa na venda falhou: ${withdrawalError}.`);
      }
      if (barterUpdated) {
        toast.info(`Permuta ${barterUpdated.reference} atualizada: ${barterUpdated.newCornTons.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t de milho — ${barterUpdated.status}.`);
      }
    },
    onError: (err) => toast.error("Erro ao registrar pesagem: " + err.message)
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.tare > 0 && formData.gross > 0 && (formData.gross - formData.tare) <= 0) {
      toast.error("Peso bruto deve ser maior que a tara.");
      return;
    }
    createMutation.mutate(formData);
  };

  const readScale = () => {
    if (isScaleActive) {
      setCurrentWeight(liveWeight);
      toast.success(`Peso atualizado: ${(liveWeight / 1000).toLocaleString()} ton`);
    } else {
      toast.error("Balança desconectada ou sem dados recentes.");
    }
  };

  const captureTare = () => {
    if (currentWeight <= 0) { toast.error("Balança sem leitura. Clique em 'Ler Balança' primeiro."); return; }
    setFormData(p => ({ ...p, tare: currentWeight }));
    toast.success("Tara capturada!");
    setTimeout(() => grossInputRef.current?.focus(), 100);
  };
  const captureGross = () => {
    if (currentWeight <= 0) { toast.error("Balança sem leitura. Clique em 'Ler Balança' primeiro."); return; }
    setFormData(p => ({ ...p, gross: currentWeight }));
    toast.success("Peso bruto capturado!");
  };

  const selectDriver = (d) => {
    setFormData(p => ({
      ...p,
      driver_name: d.name,
      vehicle_id: d.vehicleId || "avulso",
      vehicle_plate: d.plate || p.vehicle_plate,
      transporter: d.transporter || p.transporter
    }));
    setDriverSearch("");
  };

  // Auto-fill em cascata ao selecionar venda
  const handleSaleSelect = (value) => {
    const s = sales.find(x => x.id === value);
    setFormData(p => ({
      ...p,
      sale_id: value,
      apply_withdrawal: true,
      client_id: s?.client_id || p.client_id,
      product: s?.items?.[0]?.product_name || p.product,
      destination: s?.client_name ? `Entrega: ${s.client_name}` : p.destination
    }));
    if (s) setSaleSearchTerm(`${s.reference} - ${s.client_name}`);
  };

  const weightDisplay = (val) => {
    if (weightUnit === 'ton') return val > 0 ? (val / 1000) : '';
    return val > 0 ? val : '';
  };
  const weightToKg = (inputVal) => {
    const n = parseFloat(inputVal) || 0;
    return weightUnit === 'ton' ? n * 1000 : n;
  };
  const unitLabel = weightUnit === 'ton' ? 'Ton' : 'Kg';

  const filteredSales = sales
    .filter(s => !formData.client_id || s.client_id === formData.client_id)
    .filter(s =>
      s.reference.toLowerCase().includes(saleSearchTerm.toLowerCase()) ||
      s.client_name?.toLowerCase().includes(saleSearchTerm.toLowerCase())
    )
    .slice(0, 50);

  const netKg = (formData.gross || 0) - (formData.tare || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" /> Nova Pesagem
          </DialogTitle>
        </DialogHeader>
        <BranchBadge className="mb-1" />
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ===== SEÇÃO: FINALIDADE ===== */}
          <div className="space-y-2">
            <SectionHeader icon={Package} title="Finalidade" subtitle="Defina o tipo de operação" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setFormData(p => ({ ...p, purpose: "saida_venda" }))}
                className={`px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${formData.purpose === 'saida_venda' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
                🚚 Saída para Venda
              </button>
              <button type="button"
                onClick={() => setFormData(p => ({ ...p, purpose: "entrada_estoque" }))}
                className={`px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${formData.purpose === 'entrada_estoque' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
                📥 Entrada de Estoque
              </button>
            </div>
          </div>

          {/* ===== SEÇÃO: VEÍCULO & MOTORISTA ===== */}
          <div className="space-y-2">
            <SectionHeader icon={Truck} title="Veículo & Motorista" subtitle="Selecione ou cadastre avulso" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Veículo</Label>
                <Select value={formData.vehicle_id}
                  onValueChange={(value) => {
                    const vehicle = vehicles.find(v => v.id === value);
                    setFormData(p => ({
                      ...p, vehicle_id: value,
                      vehicle_plate: vehicle?.plate || "",
                      driver_name: vehicle?.driver_name || p.driver_name,
                      transporter: vehicle?.brand || p.transporter
                    }));
                  }}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione ou Avulso" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avulso">🚛 Veículo Avulso / Terceiro</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.driver_name ? `· ${v.driver_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Placa *</Label>
                <Input required value={formData.vehicle_plate} maxLength={8}
                  onChange={(e) => setFormData(p => ({ ...p, vehicle_plate: e.target.value.toUpperCase() }))}
                  placeholder="ABC-1234" className="h-10 font-mono uppercase" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Nome do Motorista *</Label>
                <Input required value={formData.driver_name}
                  onChange={(e) => setFormData(p => ({ ...p, driver_name: e.target.value }))}
                  placeholder="Nome completo"
                  className="h-10" />
                {/* Busca rápida de motorista cadastrado */}
                {formData.driver_name === "" && (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input placeholder="Buscar motorista já cadastrado..."
                        value={driverSearch}
                        onChange={(e) => setDriverSearch(e.target.value)}
                        className="pl-8 h-9 text-sm" />
                    </div>
                    {driverSearch.trim() && filteredDrivers.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto divide-y">
                        {filteredDrivers.map((d, i) => (
                          <button key={i} type="button" onClick={() => selectDriver(d)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="font-medium text-slate-800 text-sm">{d.name}</span>
                              {d.cpf && <span className="text-xs text-slate-500 ml-2">CPF: {d.cpf}</span>}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              {d.plate && <span className="font-mono">{d.plate}</span>}
                              {d.category && <span>CNH {d.category}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== SEÇÃO: PRODUTO ===== */}
          <div className="space-y-2">
            <SectionHeader icon={Package} title="Produto" subtitle="O que está sendo pesado" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Produto *</Label>
                <Input required value={formData.product}
                  onChange={(e) => setFormData(p => ({ ...p, product: e.target.value }))}
                  onFocus={() => setProductFocused(true)}
                  onBlur={() => setTimeout(() => setProductFocused(false), 150)}
                  placeholder="Ex: Calcário, Milho, Gesso..."
                  className="h-10" />
                {/* Sugestões de produto */}
                {productFocused && productSuggestions.length > 0 && !formData.product && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {productSuggestions.map(p => (
                      <button key={p} type="button"
                        onClick={() => setFormData(prev => ({ ...prev, product: p }))}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full font-medium transition-colors">
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Operador *</Label>
                <Input required value={formData.operator}
                  onChange={(e) => setFormData(p => ({ ...p, operator: e.target.value }))}
                  placeholder="Operador da balança"
                  className="h-10" />
              </div>
            </div>
          </div>

          {/* ===== SEÇÃO: PESAGEM (Balança + Captura inline) ===== */}
          <div className="space-y-2">
            <SectionHeader icon={RefreshCw} title="Pesagem" subtitle="Leitura da balança e captura de pesos" />
            {/* Monitor compacto da balança */}
            <div className="bg-slate-900 text-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-xs font-medium">{isConnected ? 'Balança Online' : 'Balança Offline'}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono">{currentWeight.toLocaleString("pt-BR")}</span>
                  <span className="text-xs text-slate-400">Kg</span>
                  <span className="text-xs text-slate-500 ml-1">({(currentWeight / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t)</span>
                </div>
                <Button type="button" onClick={readScale} variant="secondary" size="sm" className="h-8">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Ler
                </Button>
              </div>
            </div>
            {/* Toggle de unidade + inputs de peso com captura inline */}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-600">Unidade de entrada</Label>
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button type="button" onClick={() => setWeightUnit('ton')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${weightUnit === 'ton' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
                  Toneladas
                </button>
                <button type="button" onClick={() => setWeightUnit('kg')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${weightUnit === 'kg' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
                  Kg
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center justify-between">
                  <span>Tara ({unitLabel}) *</span>
                  <button type="button" onClick={captureTare}
                    className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Capturar
                  </button>
                </Label>
                <Input ref={tareInputRef} type="number" step="0.001" required
                  value={weightDisplay(formData.tare)}
                  onChange={(e) => setFormData(p => ({ ...p, tare: weightToKg(e.target.value) }))}
                  placeholder="0.000"
                  className="h-10 font-mono text-lg font-semibold" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center justify-between">
                  <span>Peso Bruto ({unitLabel}) *</span>
                  <button type="button" onClick={captureGross}
                    className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Capturar
                  </button>
                </Label>
                <Input ref={grossInputRef} type="number" step="0.001" required
                  value={weightDisplay(formData.gross)}
                  onChange={(e) => setFormData(p => ({ ...p, gross: weightToKg(e.target.value) }))}
                  placeholder="0.000"
                  className="h-10 font-mono text-lg font-semibold" />
              </div>
            </div>
            {/* Resultado do peso líquido (compacto, inline) */}
            {netKg > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-600">Peso Líquido</p>
                  <p className="text-2xl font-bold text-green-600">{netKg.toLocaleString("pt-BR")} Kg</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600">Em Toneladas</p>
                  <p className="text-2xl font-bold text-slate-700">{(netKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</p>
                </div>
              </div>
            )}
          </div>

          {/* ===== SEÇÃO: VÍNCULOS (Venda / Permuta / OC) ===== */}
          {formData.purpose === 'saida_venda' && (
            <div className="space-y-2">
              <SectionHeader icon={Link2} title="Vincular Venda" subtitle="Abate automático na retirada" />
              <Input placeholder="Buscar nº venda ou cliente..."
                value={saleSearchTerm}
                onChange={(e) => setSaleSearchTerm(e.target.value)}
                className="h-9 text-sm mb-1" />
              <Select value={formData.sale_id} onValueChange={handleSaleSelect}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a venda..." /></SelectTrigger>
                <SelectContent>
                  {filteredSales.map((sale) => (
                    <SelectItem key={sale.id} value={sale.id}>
                      {sale.reference} — {sale.client_name} ({new Date(sale.sale_date).toLocaleDateString('pt-BR')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedSale && targetItem && liveDeduction && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                        📦 Retirada ao vivo — {selectedSale.reference}
                      </p>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-amber-800 cursor-pointer">
                        <input type="checkbox" checked={formData.apply_withdrawal}
                          onChange={(e) => setFormData(p => ({ ...p, apply_withdrawal: e.target.checked }))}
                          className="rounded" />
                        Dar baixa
                      </label>
                    </div>
                    <div className="space-y-1">
                      {selectedSale.items.map((item, idx) => {
                        const isTarget = item === targetItem;
                        const pending = (item.quantity || 0) - (item.quantity_withdrawn || 0);
                        return (
                          <div key={idx} className={`flex justify-between items-center text-sm rounded px-3 py-2 border ${isTarget ? 'bg-amber-100 border-amber-300' : 'bg-white border-amber-100'}`}>
                            <div className="flex items-center gap-2">
                              {isTarget && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                              <span className={`font-medium ${isTarget ? 'text-amber-900' : 'text-slate-700'}`}>{item.product_name}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-500">
                                Pedido: <strong>{(item.quantity || 0).toLocaleString('pt-BR')}</strong> {item.unit}
                                {' · '}Retirado: <strong>{(item.quantity_withdrawn || 0).toLocaleString('pt-BR')}</strong>
                              </div>
                              {isTarget ? (
                                <div className="text-xs font-semibold text-amber-800 mt-0.5">
                                  Pendente: <strong>{pending.toLocaleString('pt-BR')}</strong> {item.unit}
                                  {liveDeduction.qty > 0 && (
                                    <> {' → '} esta pesagem: <strong className="text-amber-900">{liveDeduction.applied.toLocaleString('pt-BR')}</strong>
                                    {' → '} novo saldo: <strong>{liveDeduction.remainingAfter.toLocaleString('pt-BR')}</strong></>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400 mt-0.5">Pendente: {pending.toLocaleString('pt-BR')} {item.unit}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {liveDeduction.applied > 0 && liveDeduction.applied < liveDeduction.qty && (
                      <p className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">
                        ⚠ A pesagem ({liveDeduction.qty.toLocaleString('pt-BR')} {liveDeduction.unit}) excede o saldo pendente. Será abatido apenas {liveDeduction.applied.toLocaleString('pt-BR')} {liveDeduction.unit}.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Entrada de milho — permuta */}
          {isCornEntry && (
            <div className="space-y-2">
              <SectionHeader icon={Wheat} title="Vincular Permuta" subtitle="Milho recebido como pagamento de calcário" />
              <Input placeholder="Buscar permuta por referência ou cliente..."
                value={barterSearch}
                onChange={(e) => setBarterSearch(e.target.value)}
                className="h-9 text-sm mb-1" />
              <Select value={formData.barter_id}
                onValueChange={(value) => {
                  const b = barters.find(x => x.id === value);
                  setFormData(p => ({ ...p, barter_id: value, client_id: b?.client_id || p.client_id }));
                }}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a permuta..." /></SelectTrigger>
                <SelectContent>
                  {barters
                    .filter(b => !formData.client_id || b.client_id === formData.client_id)
                    .filter(b =>
                      b.reference?.toLowerCase().includes(barterSearch.toLowerCase()) ||
                      b.client_name?.toLowerCase().includes(barterSearch.toLowerCase())
                    )
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.reference} — {b.client_name} (Calcário: {b.limestone_tons} t)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedBarter && liveBarter && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Calcário entregue:</span>
                    <span className="font-medium">{selectedBarter.limestone_tons} t × R$ {selectedBarter.limestone_unit_value} = R$ {liveBarter.limestoneValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Milho recebido (atual):</span>
                    <span className="font-medium">{selectedBarter.corn_tons} t</span>
                  </div>
                  {liveBarter.netTons > 0 && (
                    <div className="flex justify-between text-amber-800">
                      <span>+ Esta entrada:</span>
                      <span className="font-bold">{liveBarter.netTons.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} t → {liveBarter.cornTonsAfter.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} t</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-amber-200 pt-1.5">
                    <span className="font-semibold text-slate-700">Saldo da permuta:</span>
                    <span className={`font-bold ${liveBarter.balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                      R$ {liveBarter.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {liveBarter.balance >= 0 ? ' (cliente deve calcário)' : ' (milho excede)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Entrada de estoque — balsa + OC */}
          {formData.purpose === 'entrada_estoque' && !isCornEntry && (
            <div className="space-y-2">
              <SectionHeader icon={Link2} title="Vincular Entrada" subtitle="Balsa e pedido de compra" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Nome da Balsa</Label>
                  <Input value={formData.barge_name}
                    onChange={(e) => setFormData(p => ({ ...p, barge_name: e.target.value }))}
                    placeholder="Ex: Balsa Rio Negro" className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Origem</Label>
                  <Input value={formData.origin}
                    onChange={(e) => setFormData(p => ({ ...p, origin: e.target.value }))}
                    placeholder="Porto / fornecedor" className="h-10" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Vincular Pedido de Compra (OC)</Label>
                <Input placeholder="Buscar OC por referência ou item..."
                  value={poSearchTerm}
                  onChange={(e) => setPoSearchTerm(e.target.value)}
                  className="h-9 text-sm mb-1" />
                <Select value={formData.purchase_order_id}
                  onValueChange={(value) => {
                    const po = purchaseOrders.find(o => o.id === value);
                    setFormData(p => ({ ...p, purchase_order_id: value, product: po ? po.item_name : p.product }));
                  }}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o pedido de compra..." /></SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.filter(o =>
                      o.reference?.toLowerCase().includes(poSearchTerm.toLowerCase()) ||
                      o.item_name?.toLowerCase().includes(poSearchTerm.toLowerCase()) ||
                      o.supplier_name?.toLowerCase().includes(poSearchTerm.toLowerCase())
                    ).slice(0, 50).map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.reference} — {po.item_name} ({po.quantity} {po.unit}) · {po.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ===== CAMPOS OPCIONAIS (colapsável) ===== */}
          <div className="space-y-2">
            <button type="button" onClick={() => setShowOptional(!showOptional)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Campos complementares
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showOptional ? 'rotate-180' : ''}`} />
            </button>
            {showOptional && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Nº Ticket (Físico)</Label>
                  <Input value={formData.ticket_number}
                    onChange={(e) => setFormData(p => ({ ...p, ticket_number: e.target.value }))}
                    placeholder="Gerado automaticamente se vazio" className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Transportador</Label>
                  <Input value={formData.transporter}
                    onChange={(e) => setFormData(p => ({ ...p, transporter: e.target.value }))}
                    placeholder="Nome do transportador" className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Placa 1º Reboque</Label>
                  <Input value={formData.vehicle_plate2}
                    onChange={(e) => setFormData(p => ({ ...p, vehicle_plate2: e.target.value.toUpperCase() }))}
                    placeholder="ABC-1234" className="h-10 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Placa 2º Reboque</Label>
                  <Input value={formData.vehicle_plate3}
                    onChange={(e) => setFormData(p => ({ ...p, vehicle_plate3: e.target.value.toUpperCase() }))}
                    placeholder="ABC-1234" className="h-10 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Horário de Entrada</Label>
                  <Input type="datetime-local" value={formData.entry_time}
                    onChange={(e) => setFormData(p => ({ ...p, entry_time: e.target.value }))}
                    className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Horário de Saída</Label>
                  <Input type="datetime-local" value={formData.exit_time}
                    onChange={(e) => setFormData(p => ({ ...p, exit_time: e.target.value }))}
                    className="h-10" />
                </div>
                {formData.purpose === 'saida_venda' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Origem</Label>
                      <Input value={formData.origin}
                        onChange={(e) => setFormData(p => ({ ...p, origin: e.target.value }))}
                        placeholder="Pátio / fazenda" className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Destino</Label>
                      <Input value={formData.destination}
                        onChange={(e) => setFormData(p => ({ ...p, destination: e.target.value }))}
                        placeholder="Cliente / cidade" className="h-10" />
                    </div>
                  </>
                )}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Observações</Label>
                  <Textarea value={formData.notes}
                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                    rows={2} className="text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* ===== AÇÕES ===== */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-[160px]">
              {createMutation.isPending ? "Registrando..." : "Registrar Pesagem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}