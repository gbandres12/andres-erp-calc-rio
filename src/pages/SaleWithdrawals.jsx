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
import { Package, Plus, TruckIcon, CheckCircle, AlertTriangle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function SaleWithdrawals() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [selectedSale, setSelectedSale] = useState(null);
  const [formData, setFormData] = useState({
    sale_id: "",
    product_id: "",
    product_name: "",
    quantity: 0,
    unit: "",
    responsible: "",
    vehicle_plate: "",
    notes: ""
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ 
      company_id: selectedCompanyId,
      status: ['faturada', 'concluida']
    }, '-created_date'),
    initialData: []
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['withdrawals', selectedCompanyId],
    queryFn: () => base44.entities.SaleWithdrawal.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
    initialData: []
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const createWithdrawalMutation = useMutation({
    mutationFn: async (data) => {
      // 1. Criar retirada
      const withdrawal = await base44.entities.SaleWithdrawal.create({
        ...data,
        company_id: selectedCompanyId,
        withdrawal_date: new Date().toISOString()
      });

      // 2. Atualizar venda - quantidade retirada do item
      const sale = sales.find(s => s.id === data.sale_id);
      if (sale && sale.items) {
        const updatedItems = sale.items.map(item => {
          if (item.product_id === data.product_id) {
            const newWithdrawn = (item.quantity_withdrawn || 0) + data.quantity;
            return {
              ...item,
              quantity_withdrawn: newWithdrawn
            };
          }
          return item;
        });

        // Verificar se todos os itens foram retirados
        const allWithdrawn = updatedItems.every(item => 
          (item.quantity_withdrawn || 0) >= item.quantity
        );

        const partialWithdrawn = updatedItems.some(item => 
          (item.quantity_withdrawn || 0) > 0
        );

        let withdrawalStatus = 'aguardando';
        if (allWithdrawn) {
          withdrawalStatus = 'total';
        } else if (partialWithdrawn) {
          withdrawalStatus = 'parcial';
        }

        // Atualizar venda
        await base44.entities.Sale.update(data.sale_id, {
          items: updatedItems,
          withdrawal_status: withdrawalStatus,
          status: allWithdrawn ? 'concluida' : 'faturada'
        });
      }

      return withdrawal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['withdrawals']);
      queryClient.invalidateQueries(['sales']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Retirada registrada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao registrar retirada: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      sale_id: "",
      product_id: "",
      product_name: "",
      quantity: 0,
      unit: "",
      responsible: "",
      vehicle_plate: "",
      notes: ""
    });
    setSelectedSale(null);
  };

  const handleSaleSelect = (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    setSelectedSale(sale);
    setFormData({
      ...formData,
      sale_id: saleId,
      product_id: "",
      product_name: "",
      quantity: 0,
      unit: ""
    });
  };

  const handleProductSelect = (productId) => {
    if (!selectedSale) return;
    
    const item = selectedSale.items.find(i => i.product_id === productId);
    if (item) {
      const remaining = item.quantity - (item.quantity_withdrawn || 0);
      setFormData({
        ...formData,
        product_id: productId,
        product_name: item.product_name,
        unit: item.unit,
        quantity: remaining > 0 ? remaining : 0
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedSale) {
      toast.error("Selecione uma venda");
      return;
    }

    const item = selectedSale.items.find(i => i.product_id === formData.product_id);
    if (!item) {
      toast.error("Produto não encontrado na venda");
      return;
    }

    const remaining = item.quantity - (item.quantity_withdrawn || 0);
    if (formData.quantity > remaining) {
      toast.error(`Quantidade máxima disponível: ${remaining} ${item.unit}`);
      return;
    }

    createWithdrawalMutation.mutate(formData);
  };

  // Vendas com itens pendentes de retirada
  const pendingSales = sales.filter(s => 
    s.withdrawal_status !== 'total' && 
    s.items?.some(item => (item.quantity_withdrawn || 0) < item.quantity)
  );

  // Estatísticas
  const totalWithdrawals = withdrawals.length;
  const todayWithdrawals = withdrawals.filter(w => 
    new Date(w.withdrawal_date).toDateString() === new Date().toDateString()
  ).length;

  const withdrawalStatusColors = {
    aguardando: "bg-yellow-100 text-yellow-800",
    parcial: "bg-blue-100 text-blue-800",
    total: "bg-green-100 text-green-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Controle de Retiradas</h1>
          <p className="text-slate-500 mt-1">Registro de retiradas parciais de vendas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Registrar Retirada
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Registrar Retirada de Material</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Venda / Pedido *</Label>
                <Select
                  required
                  value={formData.sale_id}
                  onValueChange={handleSaleSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a venda" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingSales.map((sale) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        {sale.reference} - {sale.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSale && (
                <>
                  <Card className="bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Cliente:</span>
                          <span>{selectedSale.client_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Data da Venda:</span>
                          <span>{new Date(selectedSale.sale_date).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Status Retirada:</span>
                          <Badge className={withdrawalStatusColors[selectedSale.withdrawal_status]}>
                            {selectedSale.withdrawal_status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <Label>Produto a Retirar *</Label>
                    <Select
                      required
                      value={formData.product_id}
                      onValueChange={handleProductSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSale.items
                          ?.filter(item => (item.quantity_withdrawn || 0) < item.quantity)
                          .map((item) => {
                            const remaining = item.quantity - (item.quantity_withdrawn || 0);
                            return (
                              <SelectItem key={item.product_id} value={item.product_id}>
                                {item.product_name} - Disponível: {remaining} {item.unit}
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.product_id && (
                    <>
                      {(() => {
                        const item = selectedSale.items.find(i => i.product_id === formData.product_id);
                        const withdrawn = item.quantity_withdrawn || 0;
                        const remaining = item.quantity - withdrawn;
                        const percentage = (withdrawn / item.quantity) * 100;

                        return (
                          <Card className="bg-slate-50">
                            <CardContent className="pt-6">
                              <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                  <span>Total Vendido:</span>
                                  <span className="font-bold">{item.quantity} {item.unit}</span>
                                </div>
                                <div className="flex justify-between text-sm text-green-600">
                                  <span>Já Retirado:</span>
                                  <span className="font-bold">{withdrawn} {item.unit}</span>
                                </div>
                                <div className="flex justify-between text-sm text-blue-600">
                                  <span>Restante:</span>
                                  <span className="font-bold">{remaining} {item.unit}</span>
                                </div>
                                <Progress value={percentage} className="h-2" />
                                <p className="text-xs text-center text-slate-500">
                                  {percentage.toFixed(1)}% retirado
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Quantidade a Retirar *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            required
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Unidade</Label>
                          <Input
                            value={formData.unit}
                            readOnly
                            className="bg-slate-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Responsável pela Retirada *</Label>
                          <Input
                            required
                            value={formData.responsible}
                            onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                            placeholder="Nome completo"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Placa do Veículo</Label>
                          <Select
                            value={formData.vehicle_plate}
                            onValueChange={(value) => setFormData({ ...formData, vehicle_plate: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione (opcional)" />
                            </SelectTrigger>
                            <SelectContent>
                              {vehicles.map((vehicle) => (
                                <SelectItem key={vehicle.id} value={vehicle.plate}>
                                  {vehicle.plate} - {vehicle.brand} {vehicle.model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          rows={3}
                          placeholder="Informações adicionais sobre a retirada..."
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createWithdrawalMutation.isPending || !formData.product_id}>
                  {createWithdrawalMutation.isPending ? "Registrando..." : "Registrar Retirada"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total de Retiradas</CardTitle>
            <Package className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalWithdrawals}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Retiradas Hoje</CardTitle>
            <Calendar className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayWithdrawals}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Vendas Pendentes</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingSales.length}</div>
            <p className="text-xs text-orange-200 mt-1">com retirada incompleta</p>
          </CardContent>
        </Card>
      </div>

      {/* Vendas Pendentes de Retirada */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Vendas com Retiradas Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingSales.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Todas as vendas foram retiradas completamente</p>
              </div>
            ) : (
              pendingSales.map((sale) => (
                <Card key={sale.id} className="border-2 border-orange-200">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-bold text-lg">{sale.reference}</p>
                        <p className="text-sm text-slate-600">{sale.client_name}</p>
                        <p className="text-xs text-slate-500">
                          Venda: {new Date(sale.sale_date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Badge className={withdrawalStatusColors[sale.withdrawal_status]}>
                        {sale.withdrawal_status}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {sale.items?.map((item, idx) => {
                        const withdrawn = item.quantity_withdrawn || 0;
                        const remaining = item.quantity - withdrawn;
                        const percentage = (withdrawn / item.quantity) * 100;

                        return (
                          <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-medium">{item.product_name}</p>
                                <div className="flex gap-4 text-xs text-slate-600 mt-1">
                                  <span>Total: {item.quantity} {item.unit}</span>
                                  <span className="text-green-600">Retirado: {withdrawn} {item.unit}</span>
                                  <span className="text-orange-600">Restante: {remaining} {item.unit}</span>
                                </div>
                              </div>
                              {remaining > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    handleSaleSelect(sale.id);
                                    handleProductSelect(item.product_id);
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  Registrar Retirada
                                </Button>
                              )}
                            </div>
                            <Progress value={percentage} className="h-2" />
                            <p className="text-xs text-slate-500 mt-1">
                              {percentage.toFixed(1)}% retirado
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Retiradas */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Retiradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {withdrawals.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma retirada registrada ainda</p>
              </div>
            ) : (
              withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <TruckIcon className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{withdrawal.sale_reference}</p>
                      <p className="text-sm text-slate-600">{withdrawal.product_name}</p>
                      <div className="flex gap-3 text-xs text-slate-500 mt-1">
                        <span>👤 {withdrawal.responsible}</span>
                        {withdrawal.vehicle_plate && <span>🚚 {withdrawal.vehicle_plate}</span>}
                        <span>📅 {new Date(withdrawal.withdrawal_date).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-600">
                      {withdrawal.quantity} {withdrawal.unit}
                    </p>
                    {withdrawal.notes && (
                      <p className="text-xs text-slate-500 mt-1">{withdrawal.notes}</p>
                    )}
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