import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TruckIcon, Plus, Edit } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function Vehicles() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [formData, setFormData] = useState({
    plate: "",
    brand: "",
    model: "",
    year: "",
    fleet_type: "propria",
    capacity: 0,
    odometer: 0,
    driver_name: "",
    driver_license: ""
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ 
      company_id: selectedCompanyId,
      status: 'ativo'
    }),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastVehicle = await base44.entities.Vehicle.list('-code', 1);
      const lastCode = lastVehicle[0]?.code || 'VEI000';
      const nextNumber = parseInt(lastCode.replace('VEI', '')) + 1;
      const newCode = `VEI${String(nextNumber).padStart(3, '0')}`;
      
      return base44.entities.Vehicle.create({
        ...data,
        code: newCode,
        company_id: selectedCompanyId,
        qr_code: `QR-${newCode}-${Date.now()}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Veículo cadastrado com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Veículo atualizado com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      plate: "",
      brand: "",
      model: "",
      year: "",
      fleet_type: "propria",
      capacity: 0,
      odometer: 0,
      driver_name: "",
      driver_license: ""
    });
    setEditingVehicle(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingVehicle) {
      updateMutation.mutate({ id: editingVehicle.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      plate: vehicle.plate || "",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year || "",
      fleet_type: vehicle.fleet_type || "propria",
      capacity: vehicle.capacity || 0,
      odometer: vehicle.odometer || 0,
      driver_name: vehicle.driver_name || "",
      driver_license: vehicle.driver_license || ""
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Veículos</h1>
          <p className="text-slate-500 mt-1">Controle da frota</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Veículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingVehicle ? "Editar Veículo" : "Novo Veículo"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Placa *</Label>
                  <Input
                    required
                    value={formData.plate}
                    onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                    placeholder="ABC-1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Frota</Label>
                  <Select
                    value={formData.fleet_type}
                    onValueChange={(value) => setFormData({ ...formData, fleet_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="propria">Própria</SelectItem>
                      <SelectItem value="agregada">Agregada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capacidade (TON)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseFloat(e.target.value) || 0 })}
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
                  <Label>Nome do Motorista</Label>
                  <Input
                    value={formData.driver_name}
                    onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>CNH</Label>
                  <Input
                    value={formData.driver_license}
                    onChange={(e) => setFormData({ ...formData, driver_license: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingVehicle ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vehicles.map((vehicle) => (
          <Card key={vehicle.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <TruckIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{vehicle.plate}</CardTitle>
                    <p className="text-sm text-slate-500">{vehicle.code}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Badge variant={vehicle.fleet_type === 'propria' ? 'default' : 'secondary'}>
                  {vehicle.fleet_type === 'propria' ? 'Própria' : 'Agregada'}
                </Badge>
                <Badge variant="outline">Ativo</Badge>
              </div>
              <div className="space-y-1 text-sm">
                {vehicle.brand && vehicle.model && (
                  <p className="text-slate-600">
                    <span className="font-medium">{vehicle.brand}</span> {vehicle.model}
                  </p>
                )}
                {vehicle.year && (
                  <p className="text-slate-600">Ano: {vehicle.year}</p>
                )}
                {vehicle.capacity > 0 && (
                  <p className="text-slate-600">Capacidade: {vehicle.capacity} TON</p>
                )}
                {vehicle.odometer > 0 && (
                  <p className="text-slate-600">Hodômetro: {vehicle.odometer.toLocaleString()} km</p>
                )}
                {vehicle.driver_name && (
                  <p className="text-slate-600">Motorista: {vehicle.driver_name}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleEdit(vehicle)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}