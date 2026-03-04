import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Scale, Plus, TruckIcon, Printer, CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import WeighingTicket from "@/components/weighing/WeighingTicket";

export default function Weighing() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [currentWeight, setCurrentWeight] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [formData, setFormData] = useState({
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
    notes: "",
    purpose: "saida_venda",
    ticket_number: ""
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [saleSearchTerm, setSaleSearchTerm] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [printWeighing, setPrintWeighing] = useState(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  const { data: scaleState } = useQuery({
    queryKey: ['scaleState', selectedCompanyId],
    queryFn: () => base44.entities.ScaleState.filter({ company_id: selectedCompanyId }),
    refetchInterval: 2000, // Poll every 2s
    initialData: []
  });

  const liveWeight = scaleState[0]?.current_weight || 0;
  const lastUpdate = scaleState[0]?.last_update;
  const isScaleActive = lastUpdate && (new Date() - new Date(lastUpdate)) < 30000; // 30s timeout

  // Update local state when live weight changes
  useEffect(() => {
    if (isScaleActive) {
      setCurrentWeight(liveWeight);
      setIsConnected(true);
    } else {
      setIsConnected(false);
    }
  }, [liveWeight, isScaleActive]);

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: weighings = [] } = useQuery({
    queryKey: ['weighings', selectedCompanyId],
    queryFn: () => base44.entities.Weighing.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true, type: 'cliente' }),
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });
  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: selectedCompanyId, status: { $in: ['concluida', 'faturada'] } }, '-created_date', 50),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastWeighing = await base44.entities.Weighing.list('-reference', 1);
      const lastRef = lastWeighing[0]?.reference || 'VG000000';
      const nextNumber = parseInt(lastRef.replace('VG', '')) + 1;
      const newRef = `VG${String(nextNumber).padStart(6, '0')}`;
      
      // Gera número de ticket único se não informado
      const ticket = data.ticket_number || `TCK-${Date.now().toString().slice(-6)}`;
      
      const net = data.gross - data.tare;
      const netTon = net / 1000; // Converte para toneladas

      // Se for veículo cadastrado, pega a placa dele, senão usa a digitada
      let plateToUse = data.vehicle_plate;
      if (data.vehicle_id && data.vehicle_id !== 'avulso') {
          const v = vehicles.find(v => v.id === data.vehicle_id);
          if (v) plateToUse = v.plate;
      }
      
      const clientName = data.client_id ? contacts.find(c => c.id === data.client_id)?.name || '' : '';

      return base44.entities.Weighing.create({
        ...data,
        reference: newRef,
        ticket_number: ticket,
        vehicle_plate: plateToUse.toUpperCase(),
        client_name: clientName,
        company_id: selectedCompanyId,
        net: net,
        net_ton: netTon,
        tare_datetime: data.entry_time || new Date().toISOString(),
        gross_datetime: data.exit_time || new Date().toISOString(),
        status: data.gross > 0 ? 'concluida' : 'aguardando_bruto'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['weighings']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Pesagem registrada com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const net = data.gross - data.tare;
      return base44.entities.Weighing.update(id, {
        ...data,
        net: net,
        status: 'concluida'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['weighings']);
      toast.success("Pesagem atualizada!");
    }
  });

  const resetForm = () => {
    setFormData({
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
      barge_name: "",
      notes: "",
      purpose: "saida_venda",
      ticket_number: ""
    });
    setSearchTerm("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  // Leitura manual (fallback ou confirmação)
  const readScale = () => {
    if (isScaleActive) {
      setCurrentWeight(liveWeight);
      toast.success(`Peso atualizado: ${(liveWeight / 1000).toLocaleString()} ton`);
    } else {
      toast.error("Balança desconectada ou sem dados recentes.");
    }
  };

  const captureTare = () => {
    setFormData({ ...formData, tare: currentWeight });
    toast.success("Tara capturada!");
  };

  const captureGross = () => {
    setFormData({ ...formData, gross: currentWeight });
    toast.success("Peso bruto capturado!");
  };

  const printTicket = (weighing) => {
    setPrintWeighing(weighing);
    setIsPrintDialogOpen(true);
  };

  const statusColors = {
    aguardando_tara: "bg-yellow-100 text-yellow-800",
    aguardando_bruto: "bg-blue-100 text-blue-800",
    concluida: "bg-green-100 text-green-800",
    cancelada: "bg-red-100 text-red-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sistema de Pesagem</h1>
          <p className="text-slate-500 mt-1">Controle de balança e pesagens</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Pesagem
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Pesagem</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Monitor da Balança */}
              <Card className="bg-slate-900 text-white">
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} ${isConnected ? 'animate-pulse' : ''}`}></div>
                      <span className="text-sm">{isConnected ? 'Balança Online (Ao Vivo)' : 'Balança Offline'}</span>
                    </div>
                    <div className="text-6xl font-bold font-mono">
                      {currentWeight.toLocaleString("pt-BR")} Kg
                    </div>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <Button type="button" onClick={readScale} variant="secondary">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Ler Balança
                    </Button>
                    <Button type="button" onClick={captureTare} variant="secondary">
                      Capturar Tara
                    </Button>
                    <Button type="button" onClick={captureGross} variant="secondary">
                      Capturar Bruto
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Finalidade da Pesagem</Label>
                  <Select
                    value={formData.purpose}
                    onValueChange={(value) => setFormData({ ...formData, purpose: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saida_venda">Saída para Venda</SelectItem>
                      <SelectItem value="entrada_estoque">Entrada de Estoque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Veículo / Motorista</Label>
                  <Select
                    value={formData.vehicle_id}
                    onValueChange={(value) => {
                      const vehicle = vehicles.find(v => v.id === value);
                      setFormData({ 
                        ...formData, 
                        vehicle_id: value,
                        vehicle_plate: vehicle?.plate || "",
                        driver_name: vehicle?.driver_name || ""
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione ou Avulso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avulso">🚛 Veículo Avulso / Terceiro</SelectItem>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} - {vehicle.brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.vehicle_id === 'avulso' && (
                    <>
                        <div className="space-y-2">
                            <Label>Placa do Veículo *</Label>
                            <Input
                                required
                                value={formData.vehicle_plate}
                                onChange={(e) => setFormData({ ...formData, vehicle_plate: e.target.value.toUpperCase() })}
                                placeholder="ABC-1234"
                                maxLength={8}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Nome do Motorista *</Label>
                            <Input
                                required
                                value={formData.driver_name}
                                onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                                placeholder="Nome completo"
                            />
                        </div>
                    </>
                )}
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Input
                    required
                    value={formData.product}
                    onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                    placeholder="Ex: Soja, Milho, etc"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Input
                    value={formData.origin}
                    onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tara (Ton) *</Label>
                  <Input
                    type="number"
                    step="0.001"
                    required
                    value={formData.tare > 0 ? formData.tare / 1000 : ''}
                    onChange={(e) => setFormData({ ...formData, tare: (parseFloat(e.target.value) || 0) * 1000 })}
                    placeholder="0.000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peso Bruto (Ton) *</Label>
                  <Input
                    type="number"
                    step="0.001"
                    required
                    value={formData.gross > 0 ? formData.gross / 1000 : ''}
                    onChange={(e) => setFormData({ ...formData, gross: (parseFloat(e.target.value) || 0) * 1000 })}
                    placeholder="0.000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operador *</Label>
                  <Input
                    required
                    value={formData.operator}
                    onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (Pesquisar)</Label>
                  <div className="relative">
                      <Input 
                          placeholder="Digite para buscar..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="mb-2"
                      />
                      <Select
                        value={formData.client_id}
                        onValueChange={(value) => {
                            const c = contacts.find(contact => contact.id === value);
                            setFormData({ ...formData, client_id: value });
                            if(c) setSearchTerm(c.name);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={formData.client_id ? contacts.find(c=>c.id===formData.client_id)?.name : "Selecione o cliente"} />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts
                            .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                            .slice(0, 50) // Limita resultados para performance
                            .map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                  </div>
                </div>

                {formData.purpose === 'saida_venda' && (
                    <div className="col-span-2 space-y-2">
                        <Label>Vincular Venda (Pesquisar)</Label>
                        <div className="relative">
                            <Input 
                                placeholder="Buscar nº venda ou cliente..." 
                                value={saleSearchTerm}
                                onChange={(e) => setSaleSearchTerm(e.target.value)}
                                className="mb-2"
                            />
                            <Select
                                value={formData.sale_id}
                                onValueChange={(value) => {
                                    const s = sales.find(sale => sale.id === value);
                                    setFormData({ ...formData, sale_id: value });
                                    if(s) setSaleSearchTerm(`${s.reference} - ${s.client_name}`);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a venda..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {sales
                                        .filter(s => !formData.client_id || s.client_id === formData.client_id)
                                        .filter(s => 
                                            s.reference.toLowerCase().includes(saleSearchTerm.toLowerCase()) || 
                                            s.client_name?.toLowerCase().includes(saleSearchTerm.toLowerCase())
                                        )
                                        .slice(0, 50)
                                        .map((sale) => (
                                        <SelectItem key={sale.id} value={sale.id}>
                                            {sale.reference} - {sale.client_name} ({new Date(sale.sale_date).toLocaleDateString()})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Detalhes dos itens da venda selecionada */}
                        {formData.sale_id && (() => {
                            const selectedSale = sales.find(s => s.id === formData.sale_id);
                            if (!selectedSale?.items?.length) return null;
                            return (
                                <Card className="bg-amber-50 border-amber-200 mt-2">
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs font-semibold text-amber-800 mb-2 uppercase tracking-wide">
                                            📦 Itens do Pedido — {selectedSale.reference}
                                        </p>
                                        <div className="space-y-1">
                                            {selectedSale.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-sm bg-white rounded px-3 py-2 border border-amber-100">
                                                    <span className="font-medium text-slate-700">{item.product_name}</span>
                                                    <span className="font-bold text-amber-700">
                                                        {item.quantity?.toLocaleString('pt-BR')} {item.unit}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between items-center text-sm font-bold bg-amber-100 rounded px-3 py-2 mt-1">
                                                <span className="text-amber-900">Total do Pedido</span>
                                                <span className="text-amber-900">
                                                    {selectedSale.items.reduce((sum, i) => sum + (i.quantity || 0), 0).toLocaleString('pt-BR')} {selectedSale.items[0]?.unit}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })()}
                    </div>
                )}

                {formData.purpose === 'entrada_estoque' && (
                    <div className="space-y-2">
                        <Label>Nome da Balsa</Label>
                        <Input 
                            value={formData.barge_name}
                            onChange={(e) => setFormData({ ...formData, barge_name: e.target.value })}
                            placeholder="Ex: Balsa Rio Negro"
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Nº Ticket (Físico/Controle)</Label>
                    <Input 
                        value={formData.ticket_number}
                        onChange={(e) => setFormData({ ...formData, ticket_number: e.target.value })}
                        placeholder="Gerado automaticamente se vazio"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Transportador</Label>
                    <Input 
                        value={formData.transporter}
                        onChange={(e) => setFormData({ ...formData, transporter: e.target.value })}
                        placeholder="Nome do transportador"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Placa 1º Reboque</Label>
                    <Input 
                        value={formData.vehicle_plate2}
                        onChange={(e) => setFormData({ ...formData, vehicle_plate2: e.target.value.toUpperCase() })}
                        placeholder="ABC-1234"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Placa 2º Reboque</Label>
                    <Input 
                        value={formData.vehicle_plate3}
                        onChange={(e) => setFormData({ ...formData, vehicle_plate3: e.target.value.toUpperCase() })}
                        placeholder="ABC-1234"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Horário de Entrada</Label>
                    <Input 
                        type="datetime-local"
                        value={formData.entry_time}
                        onChange={(e) => setFormData({ ...formData, entry_time: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Horário de Saída</Label>
                    <Input 
                        type="datetime-local"
                        value={formData.exit_time}
                        onChange={(e) => setFormData({ ...formData, exit_time: e.target.value })}
                    />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              {/* Cálculo Automático */}
              {formData.tare > 0 && formData.gross > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-sm text-slate-600 mb-1">Peso Líquido</p>
                            <p className="text-3xl font-bold text-green-600">
                                {(formData.gross - formData.tare).toLocaleString("pt-BR")} Kg
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-1">Em Toneladas</p>
                            <p className="text-3xl font-bold text-slate-400">
                                {((formData.gross - formData.tare) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t
                            </p>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Registrar Pesagem
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total de Pesagens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weighings.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Peso Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
            {weighings.reduce((sum, w) => sum + (w.net || 0), 0).toLocaleString("pt-BR")} Kg
            </div>
            </CardContent>
            </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Concluídas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {weighings.filter(w => w.status === 'concluida').length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-100">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {weighings.filter(w => w.status !== 'concluida').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros de Data */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Label className="text-sm font-medium">Filtrar por data:</Label>
            <Input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-40" />
            <span className="text-slate-500">até</span>
            <Input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-40" />
            {(filterStart || filterEnd) && (
              <Button variant="outline" size="sm" onClick={() => { setFilterStart(""); setFilterEnd(""); }}>
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Impressão */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ticket de Pesagem</DialogTitle>
          </DialogHeader>
          <WeighingTicket
            weighing={printWeighing}
            company={selectedCompany}
            onClose={() => setIsPrintDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Lista de Pesagens */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pesagens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {weighings.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Scale className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma pesagem registrada ainda</p>
              </div>
            ) : (
              weighings.filter(w => {
                if (filterStart && w.created_date < filterStart) return false;
                if (filterEnd && w.created_date > filterEnd + "T23:59:59") return false;
                return true;
              }).map((weighing) => (
                <div key={weighing.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Scale className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{weighing.reference}</p>
                        <Badge className={statusColors[weighing.status]}>
                          {weighing.status}
                        </Badge>
                        <Badge variant="outline" className="ml-2">
                          {weighing.purpose === 'entrada_estoque' ? 'Entrada' : 'Saída'}
                        </Badge>
                        {weighing.ticket_number && (
                            <Badge variant="secondary" className="ml-2 bg-slate-100 text-slate-600">
                                🎫 {weighing.ticket_number}
                            </Badge>
                        )}
                        {weighing.sale_id && (
                            <Badge variant="outline" className="ml-2 border-blue-200 text-blue-700">
                                🛒 Venda Vinculada
                            </Badge>
                        )}
                        {weighing.barge_name && (
                            <Badge variant="outline" className="ml-2 border-cyan-200 text-cyan-700">
                                🚢 {weighing.barge_name}
                            </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {weighing.vehicle_plate} • {weighing.driver_name ? `${weighing.driver_name} • ` : ''} {weighing.product}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {weighing.origin} → {weighing.destination} • Operador: {weighing.operator}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-4 mb-2">
                      <div>
                        <p className="text-xs text-slate-500">Tara</p>
                        <p className="font-semibold">{(weighing.tare || 0).toLocaleString("pt-BR")} Kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Bruto</p>
                        <p className="font-semibold">{(weighing.gross || 0).toLocaleString("pt-BR")} Kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Líquido</p>
                        <p className="text-lg font-bold text-blue-600">
                            {(weighing.net || 0).toLocaleString("pt-BR")} Kg
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printTicket(weighing)}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}