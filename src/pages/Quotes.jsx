
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
import { FileText, Plus, Trash2, Package, TrendingUp, Clock, CheckCircle2, XCircle, ArrowRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import QuoteReceipt from "../components/receipts/QuoteReceipt";
import { formatBRL } from "@/components/utils/formatters";

export default function Quotes() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [activeTab, setActiveTab] = useState("dados");
  
  const [receiptQuote, setReceiptQuote] = useState(null);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);

  // ADICIONAR: Estado para pesquisa de cliente
  const [clientSearch, setClientSearch] = useState("");

  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    seller_name: "",
    quote_date: new Date().toISOString().split('T')[0],
    validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 dias
    items: [{ product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }],
    subtotal: 0,
    discount: 0,
    shipping: 0,
    total: 0,
    notes: ""
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true, type: ['cliente', 'ambos'] }),
    initialData: []
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes', selectedCompanyId],
    queryFn: () => base44.entities.Quote.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
    initialData: []
  });

  // ADICIONAR: Query de companies
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });

  // ADICIONAR: Filtrar clientes pela pesquisa
  const filteredContacts = React.useMemo(() => {
    if (!clientSearch) return contacts;
    
    const search = clientSearch.toLowerCase();
    return contacts.filter(contact => 
      contact.name?.toLowerCase().includes(search) ||
      contact.document?.toLowerCase().includes(search) ||
      contact.phone?.toLowerCase().includes(search) ||
      contact.email?.toLowerCase().includes(search)
    );
  }, [contacts, clientSearch]);

  const createQuoteMutation = useMutation({
    mutationFn: async (data) => {
      const lastQuote = await base44.entities.Quote.list('-reference', 1);
      const lastRef = lastQuote[0]?.reference || 'ORC-00000';
      const nextNumber = parseInt(lastRef.replace('ORC-', '')) + 1;
      const newRef = `ORC-${String(nextNumber).padStart(5, '0')}`;

      const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
      const total = subtotal - data.discount + data.shipping;

      return base44.entities.Quote.create({
        reference: newRef,
        company_id: selectedCompanyId,
        client_id: data.client_id,
        client_name: data.client_name,
        seller_name: data.seller_name,
        quote_date: data.quote_date,
        validity_date: data.validity_date,
        items: data.items,
        subtotal,
        discount: data.discount,
        shipping: data.shipping,
        total,
        status: 'rascunho',
        notes: data.notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Orçamento criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar orçamento: " + error.message);
    }
  });

  const updateQuoteStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Quote.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes']);
      toast.success("Status atualizado!");
    }
  });

  const convertToSaleMutation = useMutation({
    mutationFn: async (quote) => {
      // Criar venda a partir do orçamento
      const lastSale = await base44.entities.Sale.list('-reference', 1);
      const lastRef = lastSale[0]?.reference || 'VENDA-00000';
      const nextNumber = parseInt(lastRef.replace('VENDA-', '')) + 1;
      const newRef = `VENDA-${String(nextNumber).padStart(5, '0')}`;

      const sale = await base44.entities.Sale.create({
        reference: newRef,
        company_id: quote.company_id,
        client_id: quote.client_id,
        client_name: quote.client_name,
        seller_name: quote.seller_name,
        sale_date: new Date().toISOString().split('T')[0],
        quote_id: quote.id,
        items: quote.items.map(item => ({
          ...item,
          quantity_withdrawn: 0
        })),
        subtotal: quote.subtotal,
        discount: quote.discount,
        shipping: quote.shipping,
        total: quote.total,
        paid_amount: 0,
        remaining_amount: quote.total,
        status: 'faturada',
        payment_status: 'pendente',
        withdrawal_status: 'aguardando',
        notes: quote.notes
      });

      // Atualizar orçamento como convertido
      await base44.entities.Quote.update(quote.id, {
        status: 'convertido',
        converted_sale_id: sale.id
      });

      return sale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries(['quotes']);
      queryClient.invalidateQueries(['sales']);
      toast.success("Orçamento convertido em pedido de venda!");
      // Redirecionar para a página de vendas
      navigate(createPageUrl('Sales'));
    },
    onError: (error) => {
      toast.error("Erro ao converter orçamento: " + error.message);
    }
  });

  // CORRIGIR: Função de preparar recibo de orçamento
  const handlePrintQuote = async (quote) => {
    try {
      // Buscar empresa usando a query já existente
      const company = companies.find(c => c.id === selectedCompanyId);

      if (!company) {
        toast.error("Empresa não encontrada ou não selecionada.");
        return;
      }

      const receiptData = {
        ...quote,
        company_name: company.name || '',
        company_cnpj: company.cnpj || '',
        company_address: company.address || '',
        company_city: company.city || '',
        company_state: company.state || '',
        company_phone: company.phone || '',
      };

      setReceiptQuote(receiptData);
      setIsReceiptDialogOpen(true);
    } catch (error) {
      console.error("Erro ao preparar recibo:", error);
      toast.error("Erro ao preparar recibo: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: "",
      client_name: "",
      seller_name: "",
      quote_date: new Date().toISOString().split('T')[0],
      validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }],
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      notes: ""
    });
    setActiveTab("dados");
    setClientSearch(""); // Reset client search as well
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
    recalculateTotals(newItems, formData.discount, formData.shipping);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].product_name = product.name;
        newItems[index].unit = product.unit;
        newItems[index].unit_price = product.sale_price || 0;
      }
    }

    const quantity = parseFloat(newItems[index].quantity) || 0;
    const unitPrice = parseFloat(newItems[index].unit_price) || 0;
    const discount = parseFloat(newItems[index].discount) || 0;
    newItems[index].total = (quantity * unitPrice) - discount;

    setFormData({ ...formData, items: newItems });
    recalculateTotals(newItems, formData.discount, formData.shipping);
  };

  const recalculateTotals = (items, globalDiscount, shipping) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const total = subtotal - globalDiscount + shipping;
    setFormData(prev => ({
      ...prev,
      subtotal,
      total
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createQuoteMutation.mutate(formData);
  };

  const statusColors = {
    rascunho: "bg-slate-100 text-slate-800",
    enviado: "bg-blue-100 text-blue-800",
    aprovado: "bg-green-100 text-green-800",
    rejeitado: "bg-red-100 text-red-800",
    convertido: "bg-purple-100 text-purple-800",
    expirado: "bg-orange-100 text-orange-800"
  };

  const statusIcons = {
    rascunho: FileText,
    enviado: Clock,
    aprovado: CheckCircle2,
    rejeitado: XCircle,
    convertido: ArrowRight,
    expirado: Clock
  };

  const totalQuotes = quotes.length;
  const pendingQuotes = quotes.filter(q => q.status === 'rascunho' || q.status === 'enviado').length;
  const convertedQuotes = quotes.filter(q => q.status === 'convertido').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Orçamentos</h1>
          <p className="text-slate-500 mt-1">Crie orçamentos e converta em pedidos de venda</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Orçamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Orçamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="dados">Dados do Orçamento</TabsTrigger>
                  <TabsTrigger value="itens">Itens ({formData.items.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* ATUALIZAR: Campo de Cliente com Pesquisa */}
                    <div className="space-y-2">
                      <Label>Cliente *</Label>
                      <div className="space-y-2">
                        <Input
                          placeholder="Pesquisar cliente por nome, documento, telefone..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="mb-2"
                        />
                        <Select
                          required
                          value={formData.client_id}
                          onValueChange={(value) => {
                            const client = contacts.find(c => c.id === value);
                            setFormData({ 
                              ...formData, 
                              client_id: value,
                              client_name: client?.name || ""
                            });
                            setClientSearch(""); // Limpar pesquisa após seleção
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredContacts.length === 0 ? (
                              <div className="p-2 text-sm text-slate-500 text-center">
                                Nenhum cliente encontrado
                              </div>
                            ) : (
                              filteredContacts.map((contact) => (
                                <SelectItem key={contact.id} value={contact.id}>
                                  <div>
                                    <div className="font-medium">{contact.name}</div>
                                    <div className="text-xs text-slate-500">
                                      {contact.document && `${contact.document} • `}
                                      {contact.phone}
                                    </div>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Vendedor</Label>
                      <Input
                        value={formData.seller_name}
                        onChange={(e) => setFormData({ ...formData, seller_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Emissão *</Label>
                      <Input
                        type="date"
                        required
                        value={formData.quote_date}
                        onChange={(e) => setFormData({ ...formData, quote_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Validade do Orçamento *</Label>
                      <Input
                        type="date"
                        required
                        value={formData.validity_date}
                        onChange={(e) => setFormData({ ...formData, validity_date: e.target.value })}
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
                </TabsContent>

                <TabsContent value="itens" className="space-y-4">
                  {formData.items.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-6 gap-4">
                          <div className="col-span-2 space-y-2">
                            <Label>Produto *</Label>
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
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Qtd *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Preço Un. *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              required
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Desconto</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(index, 'discount', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Total</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={item.total.toFixed(2)}
                                readOnly
                                className="bg-slate-50"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(index)}
                                disabled={formData.items.length === 1}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button type="button" variant="outline" onClick={addItem} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Item
                  </Button>

                  <Card className="bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Desconto Geral</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.discount}
                            onChange={(e) => {
                              const newDiscount = parseFloat(e.target.value) || 0;
                              setFormData({ ...formData, discount: newDiscount });
                              recalculateTotals(formData.items, newDiscount, formData.shipping);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Frete</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.shipping}
                            onChange={(e) => {
                              const newShipping = parseFloat(e.target.value) || 0;
                              setFormData({ ...formData, shipping: newShipping });
                              recalculateTotals(formData.items, formData.discount, newShipping);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>TOTAL</Label>
                          <div className="text-3xl font-bold text-blue-600">
                            {formatBRL(formData.total)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createQuoteMutation.isPending}>
                  {createQuoteMutation.isPending ? "Criando..." : "Criar Orçamento"}
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
            <CardTitle className="text-sm font-medium text-blue-100">Total de Orçamentos</CardTitle>
            <FileText className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalQuotes}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Pendentes</CardTitle>
            <Clock className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingQuotes}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Convertidos</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-purple-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{convertedQuotes}</div>
          </CardContent>
        </Card>
      </div>

      {/* NOVO: Dialog de Impressão do Orçamento */}
      <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Orçamento - {receiptQuote?.reference}</DialogTitle>
          </DialogHeader>
          {receiptQuote && (
            <QuoteReceipt
              data={receiptQuote}
              onPrint={() => setIsReceiptDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Lista de Orçamentos - ATUALIZAR os valores */}
      <Card>
        <CardHeader>
          <CardTitle>Orçamentos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {quotes.map((quote) => {
              const StatusIcon = statusIcons[quote.status];
              const isExpired = new Date(quote.validity_date) < new Date() && quote.status !== 'convertido';
              
              return (
                <div key={quote.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{quote.reference}</p>
                      <p className="text-sm text-slate-600">{quote.client_name}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={statusColors[quote.status]}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {quote.status}
                        </Badge>
                        {isExpired && quote.status !== 'convertido' && (
                          <Badge variant="destructive">Expirado</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Válido até: {new Date(quote.validity_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      {formatBRL(quote.total)}
                    </p>
                    <div className="flex gap-2 justify-end mt-3 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintQuote(quote)}
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        Imprimir
                      </Button>
                      {quote.status === 'rascunho' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuoteStatusMutation.mutate({ id: quote.id, status: 'enviado' })}
                        >
                          Marcar como Enviado
                        </Button>
                      )}
                      {quote.status === 'enviado' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuoteStatusMutation.mutate({ id: quote.id, status: 'aprovado' })}
                            className="text-green-600"
                          >
                            Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuoteStatusMutation.mutate({ id: quote.id, status: 'rejeitado' })}
                            className="text-red-600"
                          >
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {(quote.status === 'aprovado' || quote.status === 'enviado' || quote.status === 'rascunho') && (
                        <Button
                          size="sm"
                          onClick={() => convertToSaleMutation.mutate(quote)}
                          disabled={convertToSaleMutation.isPending}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <ArrowRight className="w-4 h-4 mr-1" />
                          Gerar Venda
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
