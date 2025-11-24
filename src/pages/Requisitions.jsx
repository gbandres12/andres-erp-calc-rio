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
import { FileText, Plus, Search, CheckCircle2, XCircle, Clock, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Requisitions() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  
  const [formData, setFormData] = useState({
    requester_name: "",
    department: "",
    location: "",
    notes: "",
    items: [{ product_id: "", product_name: "", quantity_requested: 0 }]
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ['requisitions', selectedCompanyId],
    queryFn: () => base44.entities.Requisition.filter({ 
      company_id: selectedCompanyId 
    }, '-created_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lastReq = await base44.entities.Requisition.list('-reference', 1);
      const lastRef = lastReq[0]?.reference || 'REQ000000';
      const nextNumber = parseInt(lastRef.replace('REQ', '')) + 1;
      const newRef = `REQ${String(nextNumber).padStart(6, '0')}`;
      
      return base44.entities.Requisition.create({
        ...data,
        reference: newRef,
        company_id: selectedCompanyId,
        status: 'pendente',
        items: data.items.map(item => {
          const product = products.find(p => p.id === item.product_id);
          return {
            ...item,
            product_name: product?.name || item.product_name,
            quantity_delivered: 0,
            quantity_returned: 0
          };
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['requisitions']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Requisição criada com sucesso!");
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Requisition.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['requisitions']);
      toast.success("Status atualizado!");
    }
  });

  const resetForm = () => {
    setFormData({
      requester_name: "",
      department: "",
      location: "",
      notes: "",
      items: [{ product_id: "", product_name: "", quantity_requested: 0 }]
    });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: "", product_name: "", quantity_requested: 0 }]
    });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const statusColors = {
    pendente: "bg-yellow-100 text-yellow-800",
    aguardando_retirada: "bg-blue-100 text-blue-800",
    concluida: "bg-green-100 text-green-800",
    recusada: "bg-red-100 text-red-800",
    aguardando_devolucao: "bg-purple-100 text-purple-800"
  };

  const filteredRequisitions = requisitions.filter(req => 
    req.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Requisições de Material</h1>
          <p className="text-slate-500 mt-1">Solicitações internas de produtos e equipamentos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Requisição
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Requisição</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Solicitante *</Label>
                  <Input
                    required
                    value={formData.requester_name}
                    onChange={(e) => setFormData({ ...formData, requester_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Departamento/Setor *</Label>
                  <Input
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Local de Uso</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Onde o material será utilizado?"
                  />
                </div>
              </div>

              <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Itens Solicitados</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Item
                  </Button>
                </div>
                
                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-7 space-y-1">
                      <Label>Produto</Label>
                      <Select
                        required
                        value={item.product_id}
                        onValueChange={(value) => updateItem(index, 'product_id', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} ({product.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label>Qtd.</Label>
                      <Input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={item.quantity_requested}
                        onChange={(e) => updateItem(index, 'quantity_requested', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2 pb-1">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeItem(index)}
                        disabled={formData.items.length === 1}
                      >
                        <XCircle className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Requisição"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Buscar requisição, solicitante ou setor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filteredRequisitions.map((req) => (
          <Card key={req.id} className="overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-slate-900">{req.reference}</h3>
                    <Badge className={statusColors[req.status]}>{req.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">
                    Solicitado por <strong>{req.requester_name}</strong> • {req.department} • {new Date(req.created_date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                {req.status === 'pendente' && (
                  <>
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'concluida' })}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Atender
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'recusada' })}
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Recusar
                    </Button>
                  </>
                )}
              </div>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Produto</TableHead>
                    <TableHead>Qtd. Solicitada</TableHead>
                    <TableHead>Status Item</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {req.items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="pl-6 font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          {item.product_name}
                        </div>
                      </TableCell>
                      <TableCell>{item.quantity_requested}</TableCell>
                      <TableCell>
                        {req.status === 'concluida' ? (
                          <span className="text-green-600 text-sm flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Entregue
                          </span>
                        ) : (
                          <span className="text-yellow-600 text-sm flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {filteredRequisitions.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Nenhuma requisição encontrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}