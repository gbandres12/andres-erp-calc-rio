import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Plus, Package, Users, Clock, Send, AlertCircle, CheckCircle2, DollarSign, Calendar, Trophy, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/components/utils/formatters";

export default function SupplierQuotes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [formData, setFormData] = useState({
    urgency: "media",
    notes: "",
    requested_suppliers: [],
    requester_name: ""
  });
  
  const [quoteItems, setQuoteItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({ product_id: "", quantity: "", product_name: "", custom_name: "" });
  const [itemMode, setItemMode] = useState("catalog"); // 'catalog' or 'custom'

  useEffect(() => {
    base44.auth.me().then(user => {
      setCurrentUser(user);
      if (user) {
        setFormData(prev => ({ ...prev, requester_name: user.full_name || "" }));
      }
    }).catch(console.error);
  }, []);

  const addItemToQuote = () => {
    if (itemMode === 'catalog' && !currentItem.product_id) {
      toast.error("Selecione um produto do catálogo.");
      return;
    }
    if (itemMode === 'custom' && !currentItem.custom_name) {
      toast.error("Digite o nome do produto/serviço.");
      return;
    }
    if (!currentItem.quantity) {
      toast.error("Informe a quantidade.");
      return;
    }
    
    let productData = {};
    if (itemMode === 'catalog') {
      const product = products.find(p => p.id === currentItem.product_id);
      productData = {
        product_id: currentItem.product_id,
        product_name: product?.name || "Produto",
        unit: product?.unit,
        quantity: currentItem.quantity
      };
    } else {
      productData = {
        product_id: null,
        product_name: currentItem.custom_name,
        unit: 'UN',
        quantity: currentItem.quantity
      };
    }

    setQuoteItems(prev => [...prev, productData]);
    setCurrentItem({ product_id: "", quantity: "", product_name: "", custom_name: "" });
  };

  const removeItemFromQuote = (index) => {
    setQuoteItems(prev => prev.filter((_, i) => i !== index));
  };

  // Queries
  const { data: quoteRequests = [] } = useQuery({
    queryKey: ['supplier-quote-requests', selectedCompanyId],
    queryFn: () => base44.entities.SupplierQuoteRequest.filter({ 
      company_id: selectedCompanyId 
    }, '-created_date'),
    initialData: []
  });

  // Query para buscar respostas de cotação (poderia ser otimizado para buscar sob demanda, mas faremos simples)
  const { data: allResponses = [] } = useQuery({
    queryKey: ['supplier-quote-responses', selectedCompanyId],
    queryFn: () => base44.entities.SupplierQuoteResponse.filter({ 
      company_id: selectedCompanyId 
    }),
    enabled: !!selectedCompanyId
  });

  const getResponsesForRequest = (requestId) => allResponses.filter(r => r.quote_request_id === requestId);

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
      let productName = data.product_name;
      
      // Se tiver ID, tenta pegar o nome do produto (fallback)
      if (data.product_id) {
        const product = products.find(p => p.id === data.product_id);
        if (product) productName = product.name;
      }
      
      const newRequest = await base44.entities.SupplierQuoteRequest.create({
        product_id: data.product_id || null,
        product_name: productName || "Produto sem nome",
        quantity: parseFloat(data.quantity),
        urgency: data.urgency,
        notes: data.notes,
        requester_name: data.requester_name,
        requested_suppliers: data.requested_suppliers,
        status: 'pendente',
        company_id: selectedCompanyId
      });

      // Trigger manual da automação se necessário, mas como configuramos automação de entidade 'create',
      // o backend já vai rodar handleNewQuoteRequest automaticamente.
      // Opcional: toast avisando que os emails estão sendo enviados.
      return newRequest;
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

    // Resposta Mutation
  const registerResponseMutation = useMutation({
    mutationFn: async (data) => {
       return base44.entities.SupplierQuoteResponse.create({
         ...data,
         company_id: selectedCompanyId,
         status: 'respondido'
       });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['supplier-quote-responses']);
      toast.success("Resposta registrada!");
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async (requestId) => {
      const res = await base44.functions.invoke('analyzeQuoteResponses', { quote_request_id: requestId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['supplier-quote-responses']);
      queryClient.invalidateQueries(['supplier-quote-requests']);
      toast.success("Análise da IA concluída! Vencedor identificado.");
    },
    onError: () => toast.error("Erro ao analisar propostas.")
  });

  // Estados locais para UI de resposta
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [currentRequestForResponse, setCurrentRequestForResponse] = useState(null);
  const [responseFormData, setResponseFormData] = useState({
     supplier_id: "",
     price: "",
     delivery_date: "",
     conditions: ""
  });

  const handleOpenResponseDialog = (request) => {
     setCurrentRequestForResponse(request);
     setResponseFormData(prev => ({ ...prev, supplier_id: request.requested_suppliers[0] || "" }));
     setResponseDialogOpen(true);
  };

  const handleSubmitResponse = (e) => {
    e.preventDefault();
    if(!currentRequestForResponse) return;
    
    // Encontrar nome do fornecedor
    const supplierName = suppliers.find(s => s.id === responseFormData.supplier_id)?.name || "Desconhecido";

    registerResponseMutation.mutate({
       quote_request_id: currentRequestForResponse.id,
       supplier_id: responseFormData.supplier_id,
       supplier_name: supplierName,
       price: parseFloat(responseFormData.price),
       delivery_date: responseFormData.delivery_date,
       conditions: responseFormData.conditions
    });
    setResponseDialogOpen(false);
  };

// Handlers
  const resetForm = () => {
    setFormData({
      urgency: "media",
      notes: "",
      requested_suppliers: [],
      requester_name: currentUser?.full_name || ""
    });
    setQuoteItems([]);
    setCurrentItem({ product_id: "", quantity: "" });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (quoteItems.length === 0) {
      toast.error("Adicione pelo menos um produto para cotar.");
      return;
    }
    if (formData.requested_suppliers.length === 0 || !formData.requester_name) {
      toast.error("Preencha os dados do solicitante e selecione fornecedores.");
      return;
    }
    
    // Criar uma cotação para cada item
    let successCount = 0;
    for (const item of quoteItems) {
      try {
        await createRequestMutation.mutateAsync({
           ...formData,
           product_id: item.product_id,
           product_name: item.product_name,
           quantity: item.quantity
        });
        successCount++;
      } catch (err) {
        console.error("Failed to create quote for item", item, err);
      }
    }
    
    if (successCount > 0) {
      toast.success(`${successCount} solicitações de cotação criadas!`);
      setIsDialogOpen(false);
      resetForm();
    }
  };

  const currentSelectedProduct = products.find(p => p.id === currentItem.product_id);

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
            <form onSubmit={handleSubmit} className="mt-4">
              <Tabs defaultValue="products" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="products">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Produtos ({quoteItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="details">
                    <Users className="w-4 h-4 mr-2" />
                    Fornecedores & Detalhes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="products" className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                    <div className="flex justify-between items-center">
                       <h3 className="font-semibold text-sm text-slate-700">Adicionar Item à Cotação</h3>
                       <div className="flex gap-2 bg-white p-1 rounded border">
                          <button
                            type="button"
                            onClick={() => setItemMode("catalog")}
                            className={`text-xs px-3 py-1 rounded transition-colors ${itemMode === "catalog" ? "bg-purple-100 text-purple-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}
                          >
                            Catálogo
                          </button>
                          <button
                            type="button"
                            onClick={() => setItemMode("custom")}
                            className={`text-xs px-3 py-1 rounded transition-colors ${itemMode === "custom" ? "bg-purple-100 text-purple-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}
                          >
                            Avulso / Outro
                          </button>
                       </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label>{itemMode === 'catalog' ? "Produto (Estoque)" : "Nome do Item / Serviço"}</Label>
                        
                        {itemMode === 'catalog' ? (
                          <Select 
                            value={currentItem.product_id} 
                            onValueChange={(val) => setCurrentItem({...currentItem, product_id: val})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione do catálogo..." />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(product => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} ({product.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input 
                             value={currentItem.custom_name}
                             onChange={(e) => setCurrentItem({...currentItem, custom_name: e.target.value})}
                             placeholder="Ex: Material de Escritório, Serviço de Manutenção..."
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label>Qtd</Label>
                        <div className="flex gap-2">
                           <Input 
                             type="number" 
                             step="0.01"
                             value={currentItem.quantity}
                             onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value})}
                             placeholder="0.00"
                           />
                           <Button type="button" onClick={addItemToQuote} size="icon" className="bg-purple-600 hover:bg-purple-700">
                             <Plus className="w-4 h-4" />
                           </Button>
                        </div>
                      </div>
                    </div>

                    {/* Preview do Produto Selecionado */}
                    {itemMode === 'catalog' && currentSelectedProduct && (
                      <div className="flex gap-3 text-sm bg-white p-2 rounded border">
                        {currentSelectedProduct.image_url && (
                           <img src={currentSelectedProduct.image_url} className="w-10 h-10 object-cover rounded" alt="" />
                        )}
                        <div>
                           <p className="font-medium">{currentSelectedProduct.name}</p>
                           <p className="text-xs text-slate-500">
                             Estoque: {currentSelectedProduct.current_stock} • Cód: {currentSelectedProduct.code}
                           </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lista de Itens Adicionados */}
                  <div className="space-y-2">
                     <h3 className="font-semibold text-sm text-slate-700">Itens na Lista</h3>
                     {quoteItems.length === 0 ? (
                       <div className="text-center py-8 border-2 border-dashed rounded-lg text-slate-400">
                         <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                         <p>Nenhum produto adicionado.</p>
                       </div>
                     ) : (
                       <div className="space-y-2 max-h-[250px] overflow-y-auto">
                         {quoteItems.map((item, index) => (
                           <div key={index} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                                 <span className="text-xs font-bold text-purple-700">{index + 1}</span>
                               </div>
                               <div>
                                 <p className="font-medium text-sm">{item.product_name}</p>
                                 <p className="text-xs text-slate-500">{item.quantity} {item.unit}</p>
                               </div>
                             </div>
                             <Button 
                               type="button" 
                               variant="ghost" 
                               size="icon" 
                               className="text-red-500 hover:text-red-700 hover:bg-red-50"
                               onClick={() => removeItemFromQuote(index)}
                             >
                               <Trash2 className="w-4 h-4" />
                             </Button>
                           </div>
                         ))}
                       </div>
                     )}
                  </div>
                </TabsContent>

                <TabsContent value="details" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Comprador (para apresentação) *</Label>
                    <Input 
                      value={formData.requester_name}
                      onChange={(e) => setFormData({...formData, requester_name: e.target.value})}
                      placeholder="Seu nome ou como prefere ser chamado"
                    />
                  </div>

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
                    <div className="flex justify-between items-center">
                       <Label>Fornecedores para Cotar *</Label>
                       <Button 
                         type="button" 
                         variant="link" 
                         size="sm" 
                         className="h-auto p-0 text-purple-600 font-normal"
                         onClick={() => navigate(createPageUrl('Contacts'))}
                       >
                         + Cadastrar Novo Fornecedor
                       </Button>
                    </div>
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
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              {supplier.name}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Observações Gerais</Label>
                    <Textarea 
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      placeholder="Ex: Preciso que seja da marca X ou Y..."
                      rows={3}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-3 pt-6 border-t mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createRequestMutation.isPending || quoteItems.length === 0} className="bg-purple-600 hover:bg-purple-700">
                  {createRequestMutation.isPending ? "Processando..." : `Iniciar ${quoteItems.length} Cotação(ões)`}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dialogo de Registro de Resposta Manual */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Registrar Proposta de Fornecedor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitResponse} className="space-y-4 mt-2">
               <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Select 
                    value={responseFormData.supplier_id}
                    onValueChange={(val) => setResponseFormData(prev => ({...prev, supplier_id: val}))}
                  >
                     <SelectTrigger>
                        <SelectValue placeholder="Selecione quem respondeu" />
                     </SelectTrigger>
                     <SelectContent>
                        {currentRequestForResponse?.requested_suppliers?.map(supId => {
                           const s = suppliers.find(x => x.id === supId);
                           return s ? <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem> : null;
                        })}
                     </SelectContent>
                  </Select>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label>Preço Ofertado (R$)</Label>
                     <Input 
                        type="number" 
                        step="0.01"
                        value={responseFormData.price}
                        onChange={(e) => setResponseFormData(prev => ({...prev, price: e.target.value}))}
                        placeholder="0.00"
                     />
                  </div>
                  <div className="space-y-2">
                     <Label>Data de Entrega</Label>
                     <Input 
                        type="date"
                        value={responseFormData.delivery_date}
                        onChange={(e) => setResponseFormData(prev => ({...prev, delivery_date: e.target.value}))}
                     />
                  </div>
               </div>

               <div className="space-y-2">
                  <Label>Condições / Obs</Label>
                  <Input 
                     value={responseFormData.conditions}
                     onChange={(e) => setResponseFormData(prev => ({...prev, conditions: e.target.value}))}
                     placeholder="Ex: Pagamento a vista, Frete incluso..."
                  />
               </div>

               <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Salvar Resposta
               </Button>
            </form>
         </DialogContent>
      </Dialog>

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
                    
                    <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleOpenResponseDialog(request)}
                          className="gap-2 text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100"
                        >
                          <Plus className="w-3 h-3" />
                          Registrar Resposta
                        </Button>

                        {getResponsesForRequest(request.id).length > 0 && (
                           <Button 
                             size="sm"
                             variant="default"
                             onClick={() => analyzeMutation.mutate(request.id)}
                             disabled={analyzeMutation.isPending}
                             className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0"
                           >
                             <Bot className="w-3 h-3" />
                             {analyzeMutation.isPending ? "Analisando..." : "Analisar com IA"}
                           </Button>
                        )}
                    </div>
                  </div>
                </div>
                
                {request.notes && (
                  <div className="mt-4 p-3 bg-white rounded border text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Obs:</span> {request.notes}
                  </div>
                )}

                {/* Lista de Respostas */}
                {getResponsesForRequest(request.id).length > 0 && (
                   <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Propostas Recebidas</h4>
                      <div className="grid gap-2">
                         {getResponsesForRequest(request.id).map(resp => (
                            <div key={resp.id} className={`flex items-center justify-between p-3 rounded-lg border ${resp.is_winner ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100'}`}>
                               <div className="flex items-center gap-3">
                                  {resp.is_winner && <Trophy className="w-4 h-4 text-green-600" />}
                                  <div>
                                     <p className="font-medium text-slate-900">{resp.supplier_name}</p>
                                     <p className="text-xs text-slate-500">Prazo: {resp.delivery_date ? formatDateTime(resp.delivery_date) : 'N/D'}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="font-bold text-slate-900">R$ {resp.price?.toFixed(2)}</p>
                                  {resp.ai_analysis && resp.is_winner && (
                                     <p className="text-xs text-green-700 max-w-[200px] truncate">{resp.ai_analysis}</p>
                                  )}
                               </div>
                            </div>
                         ))}
                      </div>
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