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
import { ShoppingCart, Plus, Trash2, DollarSign, Package, TrendingUp, AlertCircle, Receipt, Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ThermalReceipt from "../components/receipts/ThermalReceipt";
import A4Receipt from "../components/receipts/A4Receipt";
import { formatBRL } from "@/components/utils/formatters";

export default function Sales() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [activeTab, setActiveTab] = useState("dados");
  
  const [receiptSale, setReceiptSale] = useState(null); 
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false); 
  const [receiptType, setReceiptType] = useState('thermal');

  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    seller_name: "",
    sale_date: new Date().toISOString().split('T')[0],
    items: [{ product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }],
    subtotal: 0,
    discount: 0,
    shipping: 0,
    total: 0,
    notes: ""
  });

  const [paymentData, setPaymentData] = useState({
    initial_payment: 0,
    payment_method: "dinheiro",
    account_id: "",
    installments: 1,
    first_due_date: new Date().toISOString().split('T')[0]
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

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ 
      company_id: selectedCompanyId,
      is_active: true 
    }),
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies', selectedCompanyId],
    queryFn: () => selectedCompanyId ? base44.entities.Company.list() : Promise.resolve([]),
    initialData: []
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
    initialData: []
  });

  const createSaleMutation = useMutation({
    mutationFn: async (data) => {
      const lastSale = await base44.entities.Sale.list('-reference', 1);
      const lastRef = lastSale[0]?.reference || 'VENDA-00000';
      const nextNumber = parseInt(lastRef.replace('VENDA-', '')) + 1;
      const newRef = `VENDA-${String(nextNumber).padStart(5, '0')}`;

      const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
      const total = subtotal - data.discount + data.shipping;
      const paidAmount = data.initial_payment;
      const remainingAmount = total - paidAmount;

      let paymentStatus = 'pendente';
      if (paidAmount >= total) {
        paymentStatus = 'pago';
      } else if (paidAmount > 0) {
        paymentStatus = 'parcial';
      }

      const sale = await base44.entities.Sale.create({
        reference: newRef,
        company_id: selectedCompanyId,
        client_id: data.client_id,
        client_name: data.client_name,
        seller_name: data.seller_name,
        sale_date: data.sale_date,
        items: data.items,
        subtotal,
        discount: data.discount,
        shipping: data.shipping,
        total,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        payment_method: data.payment_method,
        payment_account_id: data.account_id,
        status: 'rascunho',
        payment_status: paymentStatus,
        withdrawal_status: 'aguardando',
        notes: data.notes
      });

      if (paidAmount > 0) {
        await base44.entities.SalePayment.create({
          sale_id: sale.id,
          sale_reference: newRef,
          payment_method: data.payment_method,
          amount: paidAmount,
          payment_date: data.sale_date,
          account_id: data.account_id,
          company_id: selectedCompanyId,
          notes: "Entrada da venda"
        });
      }

      if (remainingAmount > 0 && data.installments > 0) {
        const installmentValue = remainingAmount / data.installments;
        
        for (let i = 0; i < data.installments; i++) {
          const dueDate = new Date(data.first_due_date);
          dueDate.setMonth(dueDate.getMonth() + i);
          
          await base44.entities.SaleInstallment.create({
            sale_id: sale.id,
            sale_reference: newRef,
            client_id: data.client_id,
            client_name: data.client_name,
            installment_number: i + 1,
            amount: installmentValue,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pendente',
            company_id: selectedCompanyId
          });
        }
      }

      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['sales']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Venda criada como rascunho. Fature para gerar lançamentos financeiros!");
    },
    onError: (error) => {
      toast.error("Erro ao criar venda: " + error.message);
    }
  });

  const invoiceSaleMutation = useMutation({
    mutationFn: async (sale) => {
      console.log("💰 Faturando venda:", sale.reference);

      await base44.entities.Sale.update(sale.id, {
        status: 'faturada'
      });

      if (sale.paid_amount > 0) {
        await base44.entities.Transaction.create({
          description: `Entrada - ${sale.reference} - ${sale.client_name}`,
          amount: sale.paid_amount,
          type: 'receita',
          category: 'Vendas',
          status: 'pago',
          due_date: sale.sale_date,
          payment_date: sale.sale_date,
          account_id: sale.payment_account_id || '',
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: selectedCompanyId,
          paid_amount: sale.paid_amount,
          notes: `Venda: ${sale.reference}`
        });

        if (sale.payment_account_id) {
          const account = accounts.find(a => a.id === sale.payment_account_id);
          if (account) {
            await base44.entities.FinancialAccount.update(sale.payment_account_id, {
              current_balance: account.current_balance + sale.paid_amount
            });
          }
        }
        
        console.log("✅ Lançamento de entrada criado:", sale.paid_amount);
      }

      if (sale.installments && sale.installments.length > 0) {
        for (const installment of sale.installments) {
          const transaction = await base44.entities.Transaction.create({
            description: `${sale.reference} - Parcela ${installment.installment_number}/${sale.installments.length} - ${sale.client_name}`,
            amount: installment.amount,
            type: 'receita',
            category: 'Vendas',
            status: installment.status === 'pago' ? 'pago' : 'pendente',
            due_date: installment.due_date,
            payment_date: installment.payment_date || '',
            account_id: installment.account_id || '',
            contact_id: sale.client_id,
            contact_name: sale.client_name,
            company_id: selectedCompanyId,
            paid_amount: installment.paid_amount || 0,
            notes: `Venda: ${sale.reference}`
          });

          await base44.entities.SaleInstallment.update(installment.id, {
            transaction_id: transaction.id
          });

          console.log(`✅ Lançamento de parcela ${installment.installment_number} criado`);
        }
      } else if (sale.paid_amount === 0 && sale.total > 0) {
        await base44.entities.Transaction.create({
          description: `${sale.reference} - ${sale.client_name}`,
          amount: sale.total,
          type: 'receita',
          category: 'Vendas',
          status: 'pendente',
          due_date: sale.sale_date,
          payment_date: '',
          account_id: '',
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: selectedCompanyId,
          paid_amount: 0,
          notes: `Venda: ${sale.reference}`
        });
        
        console.log("✅ Lançamento único criado (sem entrada e sem parcelas)");
      }

      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['sales']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['transactions']);
      toast.success("✅ Venda faturada e lançamentos criados no financeiro!");
    },
    onError: (error) => {
      console.error("❌ Erro ao faturar venda:", error);
      toast.error("Erro ao faturar: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      client_id: "",
      client_name: "",
      seller_name: "",
      sale_date: new Date().toISOString().split('T')[0],
      items: [{ product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }],
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      notes: ""
    });
    setPaymentData({
      initial_payment: 0,
      payment_method: "dinheiro",
      account_id: "",
      installments: 1,
      first_due_date: new Date().toISOString().split('T')[0]
    });
    setActiveTab("dados");
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
    
    const dataToSend = {
      ...formData,
      initial_payment: paymentData.initial_payment,
      payment_method: paymentData.payment_method,
      account_id: paymentData.account_id,
      installments: paymentData.installments,
      first_due_date: paymentData.first_due_date
    };

    createSaleMutation.mutate(dataToSend);
  };

  const handleInvoiceSale = async (sale) => {
    if (sale.status === 'faturada') {
      toast.info("Esta venda já foi faturada!");
      return;
    }

    if (confirm(`Faturar a venda ${sale.reference}?\n\nIsso criará os lançamentos financeiros automaticamente.`)) {
      const installments = await base44.entities.SaleInstallment.filter({
        sale_id: sale.id
      }, 'installment_number');

      invoiceSaleMutation.mutate({
        ...sale,
        installments
      });
    }
  };

  const handlePrintReceipt = async (sale, type = 'thermal') => {
    try {
      const client = contacts.find(c => c.id === sale.client_id);
      
      const itemsWithDetails = await Promise.all(
        (sale.items || []).map(async (item) => {
          const product = products.find(p => p.id === item.product_id);
          return {
            ...item,
            product_code: product?.code || 'N/A'
          };
        })
      );

      const payments = await base44.entities.SalePayment.filter({
        sale_id: sale.id
      });

      const installments = await base44.entities.SaleInstallment.filter({
        sale_id: sale.id
      }, 'installment_number');

      const company = companies.find(c => c.id === selectedCompanyId);
      
      const receiptData = {
        ...sale,
        items: itemsWithDetails,
        company_name: company?.name || '',
        company_cnpj: company?.cnpj || '',
        company_address: company?.address || '',
        company_city: company?.city || '',
        company_state: company?.state || '',
        company_phone: company?.phone || '',
        client_document: client?.document || 'N/A',
        client_phone: client?.phone || 'N/A',
        client_email: client?.email || 'N/A',
        client_address: client?.address || 'N/A',
        client_city: client?.city || 'N/A',
        client_state: client?.state || 'N/A',
        client_zip_code: client?.zip_code || 'N/A',
        client_number: '',
        client_neighborhood: '',
        payments: payments,
        installments: installments,
        delivery_date: sale.delivery_date || null
      };

      const addressMatch = client?.address?.match(/,\s*(\d+)/);
      if (addressMatch) {
        receiptData.client_number = addressMatch[1];
      }

      setReceiptSale(receiptData);
      setReceiptType(type);
      setIsReceiptDialogOpen(true);
    } catch (error) {
      console.error("Erro ao preparar recibo:", error);
      toast.error("Erro ao preparar recibo");
    }
  };

  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const pendingSales = sales.filter(s => s.payment_status !== 'pago').length;

  const statusColors = {
    rascunho: "bg-slate-100 text-slate-800",
    faturada: "bg-blue-100 text-blue-800",
    concluida: "bg-green-100 text-green-800",
    cancelada: "bg-red-100 text-red-800"
  };

  const paymentStatusColors = {
    pendente: "bg-yellow-100 text-yellow-800",
    parcial: "bg-orange-100 text-orange-800",
    pago: "bg-green-100 text-green-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Vendas</h1>
          <p className="text-slate-500 mt-1">Pedidos, pagamentos e retiradas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Venda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Venda</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="dados">Dados da Venda</TabsTrigger>
                  <TabsTrigger value="itens">Itens ({formData.items.length})</TabsTrigger>
                  <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cliente *</Label>
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
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente" />
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
                    <div className="space-y-2">
                      <Label>Vendedor</Label>
                      <Input
                        value={formData.seller_name}
                        onChange={(e) => setFormData({ ...formData, seller_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data da Venda *</Label>
                      <Input
                        type="date"
                        required
                        value={formData.sale_date}
                        onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
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

                <TabsContent value="pagamento" className="space-y-4">
                  <Alert className="bg-green-50 border-green-200">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-sm text-green-800">
                      <strong>Valor Total da Venda:</strong> {formatBRL(formData.total)}
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valor da Entrada (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={paymentData.initial_payment}
                        onChange={(e) => setPaymentData({ ...paymentData, initial_payment: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Forma de Pagamento *</Label>
                      <Select
                        value={paymentData.payment_method}
                        onValueChange={(value) => setPaymentData({ ...paymentData, payment_method: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                          <SelectItem value="pix">📱 PIX</SelectItem>
                          <SelectItem value="cartao_credito">💳 Cartão Crédito</SelectItem>
                          <SelectItem value="cartao_debito">💳 Cartão Débito</SelectItem>
                          <SelectItem value="transferencia">🏦 Transferência</SelectItem>
                          <SelectItem value="cheque">📝 Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Conta que Receberá *</Label>
                      <Select
                        required
                        value={paymentData.account_id}
                        onValueChange={(value) => setPaymentData({ ...paymentData, account_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({formatBRL(account.current_balance)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(formData.total - paymentData.initial_payment) > 0 && (
                    <>
                      <Alert className="bg-orange-50 border-orange-200">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        <AlertDescription className="text-sm text-orange-800">
                          <strong>Saldo Restante:</strong> {formatBRL(formData.total - paymentData.initial_payment)}
                          <br />
                          <span className="text-xs">Este valor será parcelado e criado como contas a receber automaticamente.</span>
                        </AlertDescription>
                      </Alert>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Número de Parcelas *</Label>
                          <Input
                            type="number"
                            min="1"
                            required
                            value={paymentData.installments}
                            onChange={(e) => setPaymentData({ ...paymentData, installments: parseInt(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Vencimento 1ª Parcela *</Label>
                          <Input
                            type="date"
                            required
                            value={paymentData.first_due_date}
                            onChange={(e) => setPaymentData({ ...paymentData, first_due_date: e.target.value })}
                          />
                        </div>
                      </div>

                      <Card className="bg-slate-50">
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium mb-2">Resumo do Parcelamento:</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Valor de cada parcela:</span>
                              <span className="font-bold">
                                {formatBRL((formData.total - paymentData.initial_payment) / paymentData.installments)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-600">
                              <span>Total parcelado:</span>
                              <span>{formatBRL(formData.total - paymentData.initial_payment)}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createSaleMutation.isPending}>
                  {createSaleMutation.isPending ? "Criando..." : "Salvar Venda"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibo de Venda</DialogTitle>
          </DialogHeader>
          {receiptSale && (
            <>
              <div className="flex gap-2 mb-4 no-print">
                <Button
                  variant={receiptType === 'thermal' ? 'default' : 'outline'}
                  onClick={() => setReceiptType('thermal')}
                  size="sm"
                >
                  Bobina 80mm
                </Button>
                <Button
                  variant={receiptType === 'a4' ? 'default' : 'outline'}
                  onClick={() => setReceiptType('a4')}
                  size="sm"
                >
                  A4
                </Button>
              </div>
              
              {receiptType === 'thermal' ? (
                <ThermalReceipt
                  type="sale"
                  data={receiptSale}
                  onPrint={() => setIsReceiptDialogOpen(false)}
                />
              ) : (
                <A4Receipt
                  type="sale"
                  data={receiptSale}
                  onPrint={() => setIsReceiptDialogOpen(false)}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total em Vendas</CardTitle>
            <ShoppingCart className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatBRL(totalSales)}
            </div>
            <p className="text-xs text-blue-200 mt-1">{sales.length} vendas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Vendas Pagas</CardTitle>
            <DollarSign className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {sales.filter(s => s.payment_status === 'pago').length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Pendentes</CardTitle>
            <AlertCircle className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingSales}</div>
            <p className="text-xs text-orange-200 mt-1">com pagamento pendente</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Vendas */}
      <Card>
        <CardHeader>
          <CardTitle>Vendas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sales.map((sale) => {
              return (
                <div key={sale.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Receipt className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{sale.reference}</p>
                      <p className="text-sm text-slate-600">{sale.client_name}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={statusColors[sale.status]}>
                          {sale.status}
                        </Badge>
                        <Badge className={paymentStatusColors[sale.payment_status]}>
                          Pgto: {sale.payment_status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(sale.sale_date).toLocaleDateString('pt-BR')} • {sale.items?.length || 0} itens
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      {formatBRL(sale.total)}
                    </p>
                    {sale.paid_amount > 0 && (
                      <p className="text-sm text-green-600">
                        Pago: {formatBRL(sale.paid_amount)}
                      </p>
                    )}
                    {sale.remaining_amount > 0 && (
                      <p className="text-sm text-orange-600">
                        Restante: {formatBRL(sale.remaining_amount)}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end mt-3 flex-wrap">
                      {sale.status === 'rascunho' && (
                        <Button
                          size="sm"
                          onClick={() => handleInvoiceSale(sale)}
                          disabled={invoiceSaleMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Faturar Venda
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintReceipt(sale, 'thermal')}
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        Recibo
                      </Button>
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