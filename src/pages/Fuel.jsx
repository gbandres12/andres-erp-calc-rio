import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Fuel as FuelIcon, Plus, TruckIcon, AlertTriangle, TrendingUp, Droplet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Fuel() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTankDialogOpen, setIsTankDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [formData, setFormData] = useState({
    vehicle_id: "",
    vehicle_plate: "",
    tank_id: "",
    fuel_type: "diesel_s10",
    quantity: 0,
    cost_per_liter: 0,
    odometer: 0,
    supplier: "",
    responsible: "",
    notes: ""
  });
  const [tankFormData, setTankFormData] = useState({
    name: "",
    fuel_type: "diesel_s10",
    capacity: 0,
    current_stock: 0,
    min_stock: 0,
    location: ""
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['tanks', selectedCompanyId],
    queryFn: () => base44.entities.FuelTank.filter({ 
      company_id: selectedCompanyId,
      is_active: true 
    }),
    initialData: []
  });

  const { data: refuelings = [] } = useQuery({
    queryKey: ['refuelings', selectedCompanyId],
    queryFn: () => base44.entities.Refueling.filter({ 
      company_id: selectedCompanyId
    }, '-created_date', 100),
    initialData: []
  });

  const createRefuelingMutation = useMutation({
    mutationFn: (data) => {
      const totalCost = data.quantity * data.cost_per_liter;
      return base44.entities.Refueling.create({
        ...data,
        company_id: selectedCompanyId,
        total_cost: totalCost
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['refuelings']);
      queryClient.invalidateQueries(['tanks']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Abastecimento registrado com sucesso!");
    }
  });

  const createTankMutation = useMutation({
    mutationFn: (data) => base44.entities.FuelTank.create({
      ...data,
      company_id: selectedCompanyId
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['tanks']);
      setIsTankDialogOpen(false);
      resetTankForm();
      toast.success("Tanque cadastrado com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      vehicle_id: "",
      vehicle_plate: "",
      tank_id: "",
      fuel_type: "diesel_s10",
      quantity: 0,
      cost_per_liter: 0,
      odometer: 0,
      supplier: "",
      responsible: "",
      notes: ""
    });
  };

  const resetTankForm = () => {
    setTankFormData({
      name: "",
      fuel_type: "diesel_s10",
      capacity: 0,
      current_stock: 0,
      min_stock: 0,
      location: ""
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createRefuelingMutation.mutate(formData);
  };

  const handleTankSubmit = (e) => {
    e.preventDefault();
    createTankMutation.mutate(tankFormData);
  };

  // Cálculos
  const totalLiters = refuelings.reduce((sum, r) => sum + r.quantity, 0);
  const totalCost = refuelings.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const averageCost = totalLiters > 0 ? totalCost / totalLiters : 0;
  const lowStockTanks = tanks.filter(t => t.current_stock <= t.min_stock);

  const fuelTypeLabels = {
    diesel_s10: "Diesel S10",
    diesel_s500: "Diesel S500",
    arla32: "Arla 32",
    gasolina: "Gasolina"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Combustível</h1>
          <p className="text-slate-500 mt-1">Controle de tanques e abastecimentos</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isTankDialogOpen} onOpenChange={setIsTankDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={resetTankForm}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Tanque
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Tanque</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleTankSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={tankFormData.name}
                    onChange={(e) => setTankFormData({ ...tankFormData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Combustível *</Label>
                  <Select
                    value={tankFormData.fuel_type}
                    onValueChange={(value) => setTankFormData({ ...tankFormData, fuel_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diesel_s10">Diesel S10</SelectItem>
                      <SelectItem value="diesel_s500">Diesel S500</SelectItem>
                      <SelectItem value="arla32">Arla 32</SelectItem>
                      <SelectItem value="gasolina">Gasolina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Capacidade (L) *</Label>
                    <Input
                      type="number"
                      required
                      value={tankFormData.capacity}
                      onChange={(e) => setTankFormData({ ...tankFormData, capacity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estoque Atual (L)</Label>
                    <Input
                      type="number"
                      value={tankFormData.current_stock}
                      onChange={(e) => setTankFormData({ ...tankFormData, current_stock: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estoque Mínimo (L)</Label>
                    <Input
                      type="number"
                      value={tankFormData.min_stock}
                      onChange={(e) => setTankFormData({ ...tankFormData, min_stock: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Localização</Label>
                    <Input
                      value={tankFormData.location}
                      onChange={(e) => setTankFormData({ ...tankFormData, location: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsTankDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Criar Tanque</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Abastecimento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Registrar Abastecimento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                    <Label>Tanque *</Label>
                    <Select
                      required
                      value={formData.tank_id}
                      onValueChange={(value) => {
                        const tank = tanks.find(t => t.id === value);
                        setFormData({ 
                          ...formData, 
                          tank_id: value,
                          fuel_type: tank?.fuel_type || "diesel_s10"
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tanque" />
                      </SelectTrigger>
                      <SelectContent>
                        {tanks.map((tank) => (
                          <SelectItem key={tank.id} value={tank.id}>
                            {tank.name} ({fuelTypeLabels[tank.fuel_type]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Combustível</Label>
                    <Input value={fuelTypeLabels[formData.fuel_type]} disabled className="bg-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade (L) *</Label>
                    <Input
                      type="number"
                      required
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo por Litro (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.cost_per_liter}
                      onChange={(e) => setFormData({ ...formData, cost_per_liter: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Hodômetro (KM)</Label>
                    <Input
                      type="number"
                      value={formData.odometer}
                      onChange={(e) => setFormData({ ...formData, odometer: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fornecedor</Label>
                    <Input
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Responsável *</Label>
                    <Input
                      required
                      value={formData.responsible}
                      onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                    />
                  </div>
                </div>

                {/* Cálculo Total */}
                {formData.quantity > 0 && formData.cost_per_liter > 0 && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-slate-600 mb-2">Custo Total:</p>
                        <p className="text-3xl font-bold text-blue-600">
                          R$ {(formData.quantity * formData.cost_per_liter).toFixed(2)}
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
                    Registrar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total Abastecido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalLiters.toLocaleString()} L</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Custo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">R$ {totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Custo Médio/L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">R$ {averageCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{lowStockTanks.length}</div>
            <p className="text-xs text-orange-200 mt-1">tanques com estoque baixo</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="refuelings">
        <TabsList className="mb-6">
          <TabsTrigger value="refuelings">Abastecimentos</TabsTrigger>
          <TabsTrigger value="tanks">Tanques</TabsTrigger>
        </TabsList>

        <TabsContent value="refuelings">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Abastecimentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {refuelings.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FuelIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum abastecimento registrado ainda</p>
                  </div>
                ) : (
                  refuelings.map((refueling) => (
                    <div key={refueling.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Droplet className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{refueling.vehicle_plate}</p>
                          <p className="text-sm text-slate-600">
                            {fuelTypeLabels[refueling.fuel_type]} • {refueling.quantity} L
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {refueling.responsible} • {new Date(refueling.created_date).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">
                          R$ {refueling.total_cost?.toFixed(2)}
                        </p>
                        <p className="text-sm text-slate-500">
                          R$ {refueling.cost_per_liter?.toFixed(2)}/L
                        </p>
                        {refueling.odometer > 0 && (
                          <p className="text-xs text-slate-400 mt-1">
                            Hodômetro: {refueling.odometer.toLocaleString()} km
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tanks">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tanks.map((tank) => (
              <Card key={tank.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                        <FuelIcon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{tank.name}</CardTitle>
                        <Badge variant="secondary">{fuelTypeLabels[tank.fuel_type]}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Capacidade:</span>
                      <span className="font-medium">{tank.capacity?.toLocaleString()} L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Estoque Atual:</span>
                      <span className="font-medium text-blue-600">{tank.current_stock?.toLocaleString()} L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Estoque Mínimo:</span>
                      <span className="font-medium">{tank.min_stock?.toLocaleString()} L</span>
                    </div>
                    {tank.location && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Localização:</span>
                        <span className="font-medium">{tank.location}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Barra de Progresso */}
                  <div className="space-y-2">
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          tank.current_stock <= tank.min_stock ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${(tank.current_stock / tank.capacity) * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                      {((tank.current_stock / tank.capacity) * 100).toFixed(1)}% da capacidade
                    </p>
                  </div>

                  {tank.current_stock <= tank.min_stock && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">Estoque baixo!</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}