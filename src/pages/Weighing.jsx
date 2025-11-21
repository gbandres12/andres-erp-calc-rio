import React, { useState } from "react";
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

export default function Weighing() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [currentWeight, setCurrentWeight] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_id: "",
    vehicle_plate: "",
    product: "",
    origin: "",
    destination: "",
    tare: 0,
    gross: 0,
    operator: "",
    client_id: "",
    notes: ""
  });

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

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastWeighing = await base44.entities.Weighing.list('-reference', 1);
      const lastRef = lastWeighing[0]?.reference || 'VG000000';
      const nextNumber = parseInt(lastRef.replace('VG', '')) + 1;
      const newRef = `VG${String(nextNumber).padStart(6, '0')}`;
      
      const net = data.gross - data.tare;
      
      return base44.entities.Weighing.create({
        ...data,
        reference: newRef,
        company_id: selectedCompanyId,
        net: net,
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
      vehicle_id: "",
      vehicle_plate: "",
      product: "",
      origin: "",
      destination: "",
      tare: 0,
      gross: 0,
      operator: "",
      client_id: "",
      notes: ""
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  // Simular leitura da balança
  const readScale = () => {
    // Em produção, isso faria uma chamada HTTP para a balança
    const simulatedWeight = Math.floor(Math.random() * 50000) + 1000;
    setCurrentWeight(simulatedWeight);
    setIsConnected(true);
    toast.success(`Peso capturado: ${simulatedWeight.toLocaleString()} kg`);
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
    window.print();
    toast.success("Ticket enviado para impressão!");
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
                      <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm">{isConnected ? 'Balança Conectada' : 'Balança Desconectada'}</span>
                    </div>
                    <div className="text-6xl font-bold font-mono">
                      {currentWeight.toLocaleString()} kg
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
                <div className="space-y-2">
                  <Label>Veículo *</Label>
                  <Select
                    required
                    value={formData.vehicle_id}
                    onValueChange={(value) => {
                      const vehicle = vehicles.find(v => v.id === value);
                      setFormData({ 
                        ...formData, 
                        vehicle_id: value,
                        vehicle_plate: vehicle?.plate || ""
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} - {vehicle.brand} {vehicle.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Tara (KG) *</Label>
                  <Input
                    type="number"
                    required
                    value={formData.tare}
                    onChange={(e) => setFormData({ ...formData, tare: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peso Bruto (KG) *</Label>
                  <Input
                    type="number"
                    required
                    value={formData.gross}
                    onChange={(e) => setFormData({ ...formData, gross: parseFloat(e.target.value) || 0 })}
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
                  <Label>Cliente</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <div className="text-center">
                      <p className="text-sm text-slate-600 mb-2">Peso Líquido Calculado:</p>
                      <p className="text-4xl font-bold text-blue-600">
                        {(formData.gross - formData.tare).toLocaleString()} kg
                      </p>
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
              {weighings.reduce((sum, w) => sum + (w.net || 0), 0).toLocaleString()} kg
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
              weighings.map((weighing) => (
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
                      </div>
                      <p className="text-sm text-slate-600">
                        {weighing.vehicle_plate} • {weighing.product}
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
                        <p className="font-semibold">{weighing.tare?.toLocaleString()} kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Bruto</p>
                        <p className="font-semibold">{weighing.gross?.toLocaleString()} kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Líquido</p>
                        <p className="text-lg font-bold text-blue-600">{weighing.net?.toLocaleString()} kg</p>
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