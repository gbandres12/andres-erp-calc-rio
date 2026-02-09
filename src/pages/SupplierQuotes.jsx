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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, Plus, Package, Users, Clock, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/components/utils/formatters";

export default function SupplierQuotes() {
  const queryClient = useQueryClient();
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [formData, setFormData] = useState({
    product_id: "",
    quantity: "",
    urgency: "media",
    notes: "",
    requested_suppliers: [],
    requester_name: ""
  });

  useEffect(() => {
    base44.auth.me().then(user => {
      setCurrentUser(user);
      if (user) {
        setFormData(prev => ({ ...prev, requester_name: user.full_name || "" }));
      }
    }).catch(console.error);
  }, []);

  // Queries
  const { data: quoteRequests = [] } = useQuery({
    queryKey: ['supplier-quote-requests', selectedCompanyId],
    queryFn: () => base44.entities.SupplierQuoteRequest.filter({ 
      company_id: selectedCompanyId 
    }, '-created_date'),
    initialData: []
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCompanyId],
    queryFn: () => base44.entities.Product.filter({ 
      company_id: selectedCompanyId,
      is_active: true
    }),
    initialData: []
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', selectedCompanyId],
    queryFn: async () => {
      const contacts = await base44.entities.Contact.filter({ 
        company_id: selectedCompanyId,
        is_active: true
      });
      return contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos');
    },
    initialData: []
  });

  // Mutation
  const createRequestMutation = useMutation({
    mutationFn: async (data) => {
      const product = products.find(p => p.id === data.product_id);
      
      return base44.entities.SupplierQuoteRequest.create({
        product_id: data.product_id,
        product_name: product?.name || "Produto desconhecido",
        quantity: parseFloat(data.quantity),
        urgency: data.urgency,
        notes: data.notes,
        requester_name: data.requester_name,
        requested_suppliers: data.requested_suppliers,
        status: 'pendente',
        company_id: selectedCompanyId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['supplier-quote-requests']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Solicitação de cotação criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar solicitação: " + error.message);
    }
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      product_id: "",
      quantity: "",
      urgency: "media",
      notes: "",
      requested_suppliers: [],
      requester_name: currentUser?.full_name || ""
    });
  };

  const handleSupplierToggle = (supplierId) => {
    setFormData(prev => {
      const current = prev.requested_suppliers;
      if (current.includes(supplierId)) {
        return { ...prev, requested_suppliers: current.filter(id => id !== supplierId) };
      } else {
        return { ...prev, requested_suppliers: [...current, supplierId] };
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.product_id || !formData.quantity || formData.requested_suppliers.length === 0 || !formData.requester_name) {
      toast.error("Preencha todos os campos obrigatórios e selecione pelo menos um fornecedor.");
      return;
    }
    createRequestMutation.mutate(formData);
  };

  const selectedProduct = products.find(p => p.id === formData.product_id);

  const urgencyColors = {
    baixa: "bg-green-100 text-green-800",
    media: "bg-yellow-100 text-yellow-800",
    alta: "bg-red-100 text-red-800"
  };

  const statusColors = {
    pendente: "bg-slate-100 text-slate-800",
    em_andamento: "bg-blue-100 text-blue-800",
    concluido: "bg-green-100 text-green-800",
    cancelado: "bg-red-100 text-red-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Bot className="w-8 h-8 text-purple-600" />
            Cotações com IA
          </h1>
          <p className="text-slate-500 mt-1">Gerencie solicitações de cotação para fornecedores via IA</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              Nova Cotação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Solicitação de Cotação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              {/* Informações do Solicitante */}
              <div className="space-y-2">
                <Label>Nome do Comprador (para apresentação) *</Label>
                <Input 
                  value={formData.requester_name}
                  onChange={(e) => setFormData({...formData, requester_name: e.target.value})}
                  placeholder="Seu nome ou como prefere ser chamado"
                />
                <p className="text-xs text-slate-500">A IA usará este nome para se apresentar aos fornecedores.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select 
                    value={formData.product_id} 
                    onValueChange={(val) => setFormData({...formData, product_id: val})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({product.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Detalhes do Produto Selecionado */}
              {selectedProduct && (
                <div className="bg-slate-50 p-4 rounded-lg border flex gap-4">
                  {selectedProduct.image_url ? (
                    <img 
                      src={selectedProduct.image_url} 
                      alt={selectedProduct.name} 
                      className="w-24 h-24 object-cover rounded-md bg-white border"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-white border rounded-md flex items-center justify-center text-slate-300">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">{selectedProduct.name}</h4>
                    <p className="text-xs text-slate-500 mb-1">Cód: {selectedProduct.code}</p>
                    <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                      {selectedProduct.description || "Sem descrição detalhada."}
                    </p>
                    <div className="flex gap-2">
                       <Badge variant="outline" className="text-xs">Estoque Atual: {selectedProduct.current_stock} {selectedProduct.unit}</Badge>
                       <Badge variant="outline" className="text-xs">Último Custo: R$ {selectedProduct.cost_price?.toFixed(2) || '0.00'}</Badge>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Nível de Urgência *</Label>
                <Select 
                  value={formData.urgency} 
                  onValueChange={(val) => setFormData({...formData, urgency: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa (Pode esperar)</SelectItem>
                    <SelectItem value="media">🟡 Média (Normal)</SelectItem>
                    <SelectItem value="alta">🔴 Alta (Urgente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fornecedores para Cotar *</Label>
                <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2 bg-slate-50">
                  {suppliers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center">Nenhum fornecedor cadastrado.</p>
                  ) : (
                    suppliers.map(supplier => (
                      <div key={supplier.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={supplier.id} 
                          checked={formData.requested_suppliers.includes(supplier.id)}
                          onCheckedChange={() => handleSupplierToggle(supplier.id)}
                        />
                        <label 
                          htmlFor={supplier.id} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {supplier.name} {supplier.phone ? `(${supplier.phone})` : ''}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-slate-500">Selecione quais fornecedores a IA deve contatar.</p>
              </div>

              <div className="space-y-2">
                <Label>Observações para a IA</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Ex: Preciso que seja da marca X ou Y..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createRequestMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                  {createRequestMutation.isPending ? "Criando..." : "Iniciar Cotação"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {quoteRequests.length === 0 ? (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhuma cotação iniciada</p>
              <p className="text-sm">Crie uma nova solicitação para que a IA comece a cotar com seus fornecedores.</p>
            </CardContent>
          </Card>
        ) : (
          quoteRequests.map(request => (
            <Card key={request.id} className="hover:bg-slate-50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-slate-900">{request.product_name}</h3>
                        <Badge className={urgencyColors[request.urgency]}>
                          Urgência {request.urgency}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">
                        Quantidade: <span className="font-medium">{request.quantity}</span> • 
                        Comprador: <span className="font-medium">{request.requester_name || "N/A"}</span>
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(request.created_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {request.requested_suppliers?.length || 0} fornecedores
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge className={statusColors[request.status]}>
                      {request.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    
                    {request.status === 'pendente' && (
                      <Button size="sm" variant="outline" className="gap-2 text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100">
                        <Send className="w-3 h-3" />
                        Acompanhar Envios
                      </Button>
                    )}
                  </div>
                </div>
                
                {request.notes && (
                  <div className="mt-4 p-3 bg-white rounded border text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Obs:</span> {request.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}