import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TruckIcon, Plus, ArrowRight, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function Transfers() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_id: "",
    quantity: 0,
    origin_company_id: "",
    destination_company_id: "",
    unit_cost: 0
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.list('-created_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastTransfer = await base44.entities.Transfer.list('-reference', 1);
      const lastRef = lastTransfer[0]?.reference || 'TRF000000';
      const nextNumber = parseInt(lastRef.replace('TRF', '')) + 1;
      const newRef = `TRF${String(nextNumber).padStart(6, '0')}`;
      
      const product = products.find(p => p.id === data.product_id);
      const origin = companies.find(c => c.id === data.origin_company_id);
      const destination = companies.find(c => c.id === data.destination_company_id);
      
      return base44.entities.Transfer.create({
        ...data,
        reference: newRef,
        product_name: product?.name,
        unit: product?.unit,
        origin_name: origin?.name,
        destination_name: destination?.name,
        sent_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['transfers']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Transferência criada com sucesso!");
    }
  });

  const receiveMutation = useMutation({
    mutationFn: (id) => base44.entities.Transfer.update(id, {
      status: 'recebido',
      received_date: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['transfers']);
      toast.success("Transferência recebida!");
    }
  });

  const resetForm = () => {
    setFormData({
      product_id: "",
      quantity: 0,
      origin_company_id: "",
      destination_company_id: "",
      unit_cost: 0
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.origin_company_id === formData.destination_company_id) {
      toast.error("Origem e destino devem ser diferentes!");
      return;
    }
    createMutation.mutate(formData);
  };

  const statusColors = {
    enviado: "bg-yellow-100 text-yellow-800",
    recebido: "bg-green-100 text-green-800",
    cancelado: "bg-red-100 text-red-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Transferências</h1>
          <p className="text-slate-500 mt-1">Movimentação entre filiais</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Transferência
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Transferência</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Origem *</Label>
                  <Select
                    required
                    value={formData.origin_company_id}
                    onValueChange={(value) => setFormData({ ...formData, origin_company_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destino *</Label>
                  <Select
                    required
                    value={formData.destination_company_id}
                    onValueChange={(value) => setFormData({ ...formData, destination_company_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input
                    type="number"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Custo Unitário (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.unit_cost}
                    onChange={(e) => setFormData({ ...formData, unit_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Criar Transferência</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {transfers.map((transfer) => (
          <Card key={transfer.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <TruckIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-slate-900">{transfer.reference}</p>
                    <p className="text-slate-600">{transfer.product_name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-slate-600">{transfer.origin_name}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{transfer.destination_name}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <p className="text-2xl font-bold text-slate-900">
                    {transfer.quantity} {transfer.unit}
                  </p>
                  <Badge className={statusColors[transfer.status]}>
                    {transfer.status}
                  </Badge>
                  {transfer.status === 'enviado' && (
                    <Button
                      size="sm"
                      onClick={() => receiveMutation.mutate(transfer.id)}
                      className="w-full mt-2"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Receber
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}