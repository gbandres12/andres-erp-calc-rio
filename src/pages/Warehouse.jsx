import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Warehouse, Plus, Package, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [formData, setFormData] = useState({
    product_id: "",
    location: "",
    sector: "santarem",
    origin: "compra",
    condition: "novo",
    quantity_received: 0,
    supplier: "",
    invoice_number: "",
    unit_cost: 0
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: stockEntries = [] } = useQuery({
    queryKey: ['stockEntries', selectedCompanyId],
    queryFn: () => base44.entities.StockEntry.filter({ 
      company_id: selectedCompanyId,
      status: 'ativo'
    }, '-created_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastEntry = await base44.entities.StockEntry.list('-reference', 1);
      const lastRef = lastEntry[0]?.reference || 'ENT000000';
      const nextNumber = parseInt(lastRef.replace('ENT', '')) + 1;
      const newRef = `ENT${String(nextNumber).padStart(6, '0')}`;
      
      const product = products.find(p => p.id === data.product_id);
      
      return base44.entities.StockEntry.create({
        ...data,
        reference: newRef,
        company_id: selectedCompanyId,
        product_name: product?.name,
        quantity_available: data.quantity_received,
        total_cost: data.quantity_received * data.unit_cost
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['stockEntries']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Entrada registrada com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      product_id: "",
      location: "",
      sector: "santarem",
      origin: "compra",
      condition: "novo",
      quantity_received: 0,
      supplier: "",
      invoice_number: "",
      unit_cost: 0
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const totalValue = stockEntries.reduce((sum, e) => sum + (e.quantity_available * e.unit_cost || 0), 0);
  const totalItems = stockEntries.reduce((sum, e) => sum + e.quantity_available, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Almoxarifado</h1>
          <p className="text-slate-500 mt-1">Controle de entradas e estoque</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Entrada
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar Entrada de Estoque</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Produto *</Label>
                  <Select
                    required
                    value={formData.product_id}
                    onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({product.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Localização Física</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Ex: Prateleira A1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Setor *</Label>
                  <Select
                    value={formData.sector}
                    onValueChange={(value) => setFormData({ ...formData, sector: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="santarem">Santarém</SelectItem>
                      <SelectItem value="fazenda">Fazenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Origem *</Label>
                  <Select
                    value={formData.origin}
                    onValueChange={(value) => setFormData({ ...formData, origin: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compra">Compra</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="ajuste">Ajuste</SelectItem>
                      <SelectItem value="devolucao">Devolução</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condição</Label>
                  <Select
                    value={formData.condition}
                    onValueChange={(value) => setFormData({ ...formData, condition: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="usado">Usado</SelectItem>
                      <SelectItem value="recondicionado">Recondicionado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade Recebida *</Label>
                  <Input
                    type="number"
                    required
                    value={formData.quantity_received}
                    onChange={(e) => setFormData({ ...formData, quantity_received: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Custo Unitário (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={formData.unit_cost}
                    onChange={(e) => setFormData({ ...formData, unit_cost: parseFloat(e.target.value) || 0 })}
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
                  <Label>Nota Fiscal</Label>
                  <Input
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar Entrada</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total de Entradas</CardTitle>
            <Package className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stockEntries.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Itens em Estoque</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalItems.toFixed(0)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Valor Total</CardTitle>
            <AlertCircle className="h-5 w-5 text-purple-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entradas de Estoque</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stockEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Warehouse className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{entry.product_name}</p>
                    <p className="text-sm text-slate-500">{entry.reference}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary">{entry.sector}</Badge>
                      <Badge variant="outline">{entry.origin}</Badge>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">
                    {entry.quantity_available} un
                  </p>
                  <p className="text-sm text-slate-500">
                    R$ {(entry.quantity_available * entry.unit_cost).toFixed(2)}
                  </p>
                  {entry.location && (
                    <p className="text-xs text-slate-400 mt-1">{entry.location}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}