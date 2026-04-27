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
import { ShoppingCart, Plus, Trash2, DollarSign, Package, TrendingUp, AlertCircle, Receipt, Printer, FileText, Check, ChevronsUpDown, Search, MessageCircle, Pencil, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ThermalReceipt from "../components/receipts/ThermalReceipt";
import A4Receipt from "../components/receipts/A4Receipt";
import PaymentReceipt from "../components/receipts/PaymentReceipt";
import { formatBRL, getTodayDate, formatDate } from "@/components/utils/formatters";
import { ProductSelector } from "@/components/sales/ProductSelector";
import SalePaymentDialog from "@/components/sales/SalePaymentDialog";
import SaleEditDialog from "@/components/sales/SaleEditDialog";
import SaleCancelDialog from "@/components/sales/SaleCancelDialog";

export default function Sales() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => localStorage.getItem('selectedCompanyId'));

  // Sincroniza ao montar e ao mudar de filial
  useEffect(() => {
    const id = localStorage.getItem('selectedCompanyId');
    if (id !== selectedCompanyId) {
      setSelectedCompanyId(id);
    }

    const onStorage = (e) => {
      if (e.key === 'selectedCompanyId') {
        setSelectedCompanyId(e.newValue);
        queryClient.invalidateQueries(['sales']);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeTab, setActiveTab] = useState("dados");
  const [openClientCombobox, setOpenClientCombobox] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  
  // Novo Cliente State
  const [isNewClientDialogOpen, setIsNewClientDialogOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    name: "",
    phone: "",
    document: "",
    email: ""
  });

  const [receiptSale, setReceiptSale] = useState(null); 
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false); 
  const [receiptType, setReceiptType] = useState('thermal');
  
  const [paymentReceiptData, setPaymentReceiptData] = useState(null);
  const [isPaymentReceiptOpen, setIsPaymentReceiptOpen] = useState(false);

  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    seller_name: "",
    sale_date: getTodayDate(),
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
    first_due_date: getTodayDate()
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
    refetchOnMount: true,
    staleTime: 0,
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const result = await base44.entities.Sale.filter({ company_id: selectedCompanyId });
      return result.sort((a, b) => {
        // Primeiro por data de emissão (decrescente)
        const da = a.sale_date || '';
        const db = b.sale_date || '';
        if (db !== da) return db.localeCompare(da);
        // Depois por data de criação (decrescente)
        const ca = a.created_date || '';
        const cb = b.created_date || '';
        return cb.localeCompare(ca);
      });
    },
    initialData: []
  });

  const createClientMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create({
      ...data,
      type: 'cliente',
      company_id: selectedCompanyId,
      is_active: true
    }),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries(['contacts']);
      setFormData({
        ...formData,
        client_id: newClient.id,
        client_name: newClient.name
      });
      setIsNewClientDialogOpen(false);
      setOpenClientCombobox(false);
      setNewClientData({ name: "", phone: "", document: "", email: "" });
      toast.success("Cliente cadastrado e selecionado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar cliente: " + error.message);
    }
  });

  const createSaleMutation = useMutation({
    mutationFn: async (data) => {
      // Buscar TODAS as vendas para garantir referência única global
      const allSales = await base44.entities.Sale.list('-created_date', 1000);
      const maxNum = allSales.reduce((max, s) => {
        // Extrai apenas os dígitos no final da referência (ex: VENDA-00001, VEN-519423)
        const match = (s.reference || '').match(/(\d+)$/);
        const n = match ? parseInt(match[1]) : 0;
        return n > max ? n : max;
      }, 0);
      const newRef = `VENDA-${String(maxNum + 1).padStart(5, '0')}`;

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

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [saleToPayment, setSaleToPayment] = useState(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);

  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [saleToInvoice, setSaleToInvoice] = useState(null);
  const [invoicePayments, setInvoicePayments] = useState([]);

  const invoiceSaleMutation = useMutation({
    mutationFn: async ({ sale, payments }) => {
      console.log("💰 Faturando venda:", sale.reference);

      await base44.entities.Sale.update(sale.id, {
        status: 'faturada'
      });

      // Processar pagamentos fracionados
      let totalPaidNow = 0;
      for (const payment of payments) {
        if (payment.amount > 0) {
          await base44.entities.Transaction.create({
            description: `${sale.reference} - ${payment.description || 'Pagamento'} - ${sale.client_name}`,
            amount: payment.amount,
            type: 'receita',
            category: 'Vendas',
            status: 'pago',
            due_date: payment.date,
            payment_date: payment.date,
            account_id: payment.account_id,
            contact_id: sale.client_id,
            contact_name: sale.client_name,
            company_id: selectedCompanyId,
            paid_amount: payment.amount,
            notes: `Venda: ${sale.reference} - ${payment.payment_method}`
          });

          await base44.entities.SalePayment.create({
            sale_id: sale.id,
            sale_reference: sale.reference,
            payment_method: payment.payment_method,
            amount: payment.amount,
            payment_date: payment.date,
            account_id: payment.account_id,
            company_id: selectedCompanyId,
            notes: payment.description || ''
          });

          totalPaidNow += payment.amount;
        }
      }

      // Criar conta a receber para o saldo restante
      const remainingAmount = sale.total - totalPaidNow;
      if (remainingAmount > 0.01) {
        await base44.entities.Transaction.create({
          description: `${sale.reference} - Saldo a Receber - ${sale.client_name}`,
          amount: remainingAmount,
          type: 'receita',
          category: 'Vendas',
          status: 'pendente',
          due_date: sale.sale_date,
          contact_id: sale.client_id,
          contact_name: sale.client_name,
          company_id: selectedCompanyId,
          paid_amount: 0,
          notes: `Venda: ${sale.reference}`
        });
      }

      // Atualizar venda
      const newPaidAmount = (sale.paid_amount || 0) + totalPaidNow;
      const newRemainingAmount = sale.total - newPaidAmount;
      let paymentStatus = 'pendente';
      if (newRemainingAmount <= 0.01) paymentStatus = 'pago';
      else if (newPaidAmount > 0) paymentStatus = 'parcial';

      await base44.entities.Sale.update(sale.id, {
        paid_amount: newPaidAmount,
        remaining_amount: newRemainingAmount,
        payment_status: paymentStatus
      });

      return sale;
    },
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['sales']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['transactions']);
      setIsInvoiceDialogOpen(false);
      setSaleToInvoice(null);
      setInvoicePayments([]);
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

    const quantity = newItems[index].quantity === '' ? 0 : parseFloat(newItems[index].quantity) || 0;
    const unitPrice = newItems[index].unit_price === '' ? 0 : parseFloat(newItems[index].unit_price) || 0;
    const discount = newItems[index].discount === '' ? 0 : parseFloat(newItems[index].discount) || 0;
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
      discount: formData.discount === '' ? 0 : parseFloat(formData.discount),
      shipping: formData.shipping === '' ? 0 : parseFloat(formData.shipping),
      initial_payment: paymentData.initial_payment === '' ? 0 : parseFloat(paymentData.initial_payment),
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

    setSaleToInvoice(sale);
    setInvoicePayments([{
      description: "Pagamento 1",
      amount: 0,
      date: getTodayDate(),
      account_id: "",
      payment_method: "dinheiro"
    }]);
    setIsInvoiceDialogOpen(true);
  };

  const addInvoicePayment = () => {
    setInvoicePayments([...invoicePayments, {
      description: `Pagamento ${invoicePayments.length + 1}`,
      amount: 0,
      date: getTodayDate(),
      account_id: "",
      payment_method: "dinheiro"
    }]);
  };

  const removeInvoicePayment = (idx) => {
    setInvoicePayments(invoicePayments.filter((_, i) => i !== idx));
  };

  const updateInvoicePayment = (idx, field, value) => {
    const updated = [...invoicePayments];
    updated[idx][field] = value;
    setInvoicePayments(updated);
  };

  const confirmInvoice = () => {
    invoiceSaleMutation.mutate({ sale: saleToInvoice, payments: invoicePayments });
  };

  const handlePrintPaymentReceipt = async (sale, paymentId) => {
    try {
      const allPayments = await base44.entities.SalePayment.filter({ sale_id: sale.id }, 'payment_date');
      const paymentIndex = allPayments.findIndex(p => p.id === paymentId);
      const currentPayment = allPayments[paymentIndex];
      const previousPayments = allPayments.slice(0, paymentIndex);
      
      const company = companies.find(c => c.id === selectedCompanyId);
      
      setPaymentReceiptData({
        payment: currentPayment,
        sale: {
          ...sale,
          company_name: company?.name || '',
          company_cnpj: company?.cnpj || ''
        },
        previousPayments
      });
      setIsPaymentReceiptOpen(true);
    } catch (error) {
      toast.error("Erro ao carregar dados do recibo");
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

  const handleSendWhatsApp = (sale, client) => {
    const phone = client?.phone?.replace(/\D/g, '');
    const items = (sale.items || [])
      .map(i => `• ${i.product_name} — ${Number(i.quantity).toLocaleString('pt-BR')} ${i.unit} x ${formatBRL(i.unit_price)} = *${formatBRL(i.total)}*`)
      .join('\n');

    const msg = [
      `🧾 *PEDIDO DE VENDA — ${sale.reference}*`,
      `📅 Data: ${formatDate(sale.sale_date)}`,
      `👤 Cliente: ${sale.client_name}`,
      ``,
      `*Itens:*`,
      items,
      ``,
      sale.discount > 0 ? `🏷️ Desconto: ${formatBRL(sale.discount)}` : null,
      sale.shipping > 0 ? `🚚 Frete: ${formatBRL(sale.shipping)}` : null,
      `💰 *Total: ${formatBRL(sale.total)}*`,
      sale.paid_amount > 0 ? `✅ Pago: ${formatBRL(sale.paid_amount)}` : null,
      sale.remaining_amount > 0 ? `⏳ Saldo: ${formatBRL(sale.remaining_amount)}` : null,
      sale.notes ? `\n📝 ${sale.notes}` : null,
    ].filter(Boolean).join('\n');

    const url = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
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
                    <div className="space-y-2 flex flex-col">
                      <div className="flex justify-between items-center">
                        <Label>Cliente *</Label>
                        <Button 
                          type="button" 
                          variant="link" 
                          size="sm" 
                          className="h-auto p-0 text-blue-600"
                          onClick={() => setIsNewClientDialogOpen(true)}
                        >
                          + Novo Cliente
                        </Button>
                      </div>
                      <Popover open={openClientCombobox} onOpenChange={setOpenClientCombobox}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openClientCombobox}
                            className="justify-between w-full font-normal"
                          >
                            {formData.client_id
                              ? contacts.find((contact) => contact.id === formData.client_id)?.name
                              : "Selecione o cliente..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Pesquisar cliente..." />
                            <CommandList>
                              <CommandEmpty>
                                <div className="p-2 text-center">
                                  <p className="text-sm text-slate-500 mb-2">Cliente não encontrado</p>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="w-full"
                                    onClick={() => setIsNewClientDialogOpen(true)}
                                  >
                                    <Plus className="w-4 h-4 mr-2" /> Cadastrar Novo
                                  </Button>
                                </div>
                              </CommandEmpty>
                              <CommandGroup>
                                {contacts.map((contact) => (
                                  <CommandItem
                                    key={contact.id}
                                    value={contact.name}
                                    onSelect={() => {
                                      setFormData({ 
                                        ...formData, 
                                        client_id: contact.id,
                                        client_name: contact.name 
                                      });
                                      setOpenClientCombobox(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.client_id === contact.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {contact.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                            <ProductSelector
                              products={products}
                              value={item.product_id}
                              onChange={(value) => updateItem(index, 'product_id', value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Qtd *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', e.target.value === '' ? '' : e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Preço Un. *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              required
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, 'unit_price', e.target.value === '' ? '' : e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Desconto</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(index, 'discount', e.target.value === '' ? '' : e.target.value)}
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
                              const val = e.target.value === '' ? '' : e.target.value;
                              const newDiscount = val === '' ? 0 : parseFloat(val) || 0;
                              setFormData({ ...formData, discount: val });
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
                              const val = e.target.value === '' ? '' : e.target.value;
                              const newShipping = val === '' ? 0 : parseFloat(val) || 0;
                              setFormData({ ...formData, shipping: val });
                              recalculateTotals(formData.items, formData.discount || 0, newShipping);
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
                        onChange={(e) => setPaymentData({ ...paymentData, initial_payment: e.target.value === '' ? '' : e.target.value })}
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

      {/* Dialog Faturamento com Pagamentos Fracionados */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Faturar Venda - Pagamentos Recebidos</DialogTitle>
          </DialogHeader>
          {saleToInvoice && (
            <div className="space-y-4">
              <Card className="bg-blue-50">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{saleToInvoice.reference}</p>
                      <p className="text-sm text-slate-600">{saleToInvoice.client_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Valor Total</p>
                      <p className="text-2xl font-bold text-blue-600">{formatBRL(saleToInvoice.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Pagamentos Recebidos</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addInvoicePayment}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>

                {invoicePayments.map((payment, idx) => (
                  <Card key={idx}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Descrição</Label>
                          <Input 
                            placeholder="Ex: Entrada, PIX, etc"
                            value={payment.description}
                            onChange={e => updateInvoicePayment(idx, 'description', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Valor (R$)</Label>
                          <Input 
                            type="number"
                            step="0.01"
                            value={payment.amount}
                            onChange={e => updateInvoicePayment(idx, 'amount', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Data</Label>
                          <Input 
                            type="date"
                            value={payment.date}
                            onChange={e => updateInvoicePayment(idx, 'date', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Forma</Label>
                          <Select value={payment.payment_method} onValueChange={v => updateInvoicePayment(idx, 'payment_method', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dinheiro">Dinheiro</SelectItem>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                              <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                              <SelectItem value="transferencia">Transferência</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Conta</Label>
                          <div className="flex gap-2">
                            <Select value={payment.account_id} onValueChange={v => updateInvoicePayment(idx, 'account_id', v)} className="flex-1">
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a conta" />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts.map(a => (
                                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {invoicePayments.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" onClick={() => removeInvoicePayment(idx)}>
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-slate-50">
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total da Venda:</span>
                      <span className="font-bold">{formatBRL(saleToInvoice.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Pagamentos Registrados:</span>
                      <span className="font-bold text-green-600">
                        {formatBRL(invoicePayments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="font-semibold">Saldo a Receber:</span>
                      <span className="font-bold text-orange-600">
                        {formatBRL(saleToInvoice.total - invoicePayments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>Cancelar</Button>
                <Button onClick={confirmInvoice} disabled={invoiceSaleMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  {invoiceSaleMutation.isPending ? 'Faturando...' : 'Confirmar Faturamento'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Dialog Recibo de Pagamento Individual */}
      <Dialog open={isPaymentReceiptOpen} onOpenChange={setIsPaymentReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recibo de Pagamento</DialogTitle>
          </DialogHeader>
          {paymentReceiptData && (
            <PaymentReceipt 
              payment={paymentReceiptData.payment}
              sale={paymentReceiptData.sale}
              previousPayments={paymentReceiptData.previousPayments}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Cancelar Venda */}
      <SaleCancelDialog
        sale={saleToCancel}
        open={isCancelDialogOpen}
        onClose={() => { setIsCancelDialogOpen(false); setSaleToCancel(null); }}
        onSuccess={() => { queryClient.invalidateQueries(['sales']); queryClient.invalidateQueries(['transactions']); queryClient.invalidateQueries(['accounts']); }}
      />

      {/* Dialog Editar Venda */}
      <SaleEditDialog
        sale={saleToEdit}
        products={products}
        contacts={contacts}
        open={isEditDialogOpen}
        onClose={() => { setIsEditDialogOpen(false); setSaleToEdit(null); }}
        onSuccess={() => queryClient.invalidateQueries(['sales'])}
      />

      {/* Dialog Receber Pagamento */}
      <SalePaymentDialog
        sale={saleToPayment}
        accounts={accounts}
        company={companies.find(c => c.id === selectedCompanyId)}
        open={isPaymentDialogOpen}
        onClose={() => { setIsPaymentDialogOpen(false); setSaleToPayment(null); }}
        onSuccess={() => { queryClient.invalidateQueries(['sales']); queryClient.invalidateQueries(['accounts']); queryClient.invalidateQueries(['transactions']); }}
      />

      {/* Dialog Novo Cliente Rápido */}
      <Dialog open={isNewClientDialogOpen} onOpenChange={setIsNewClientDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input 
                value={newClientData.name}
                onChange={(e) => setNewClientData({...newClientData, name: e.target.value})}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input 
                value={newClientData.phone}
                onChange={(e) => setNewClientData({...newClientData, phone: e.target.value})}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF / CNPJ</Label>
              <Input 
                value={newClientData.document}
                onChange={(e) => setNewClientData({...newClientData, document: e.target.value})}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={newClientData.email}
                onChange={(e) => setNewClientData({...newClientData, email: e.target.value})}
                placeholder="cliente@email.com"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsNewClientDialogOpen(false)}>Cancelar</Button>
              <Button 
                onClick={() => createClientMutation.mutate(newClientData)}
                disabled={!newClientData.name || createClientMutation.isPending}
              >
                {createClientMutation.isPending ? "Cadastrando..." : "Cadastrar e Selecionar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Buscar por referência, cliente ou status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Label className="text-sm font-medium">Data:</Label>
            <Input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-40" />
            <span className="text-slate-500">até</span>
            <Input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-40" />
            {(filterStart || filterEnd) && (
              <Button variant="outline" size="sm" onClick={() => { setFilterStart(""); setFilterEnd(""); }}>
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
            {sales.filter(sale => {
              const matchText = sale.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                sale.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                sale.status?.toLowerCase().includes(searchTerm.toLowerCase());
              if (!matchText) return false;
              if (filterStart && sale.sale_date < filterStart) return false;
              if (filterEnd && sale.sale_date > filterEnd) return false;
              return true;
            }).map((sale) => {
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
                        {formatDate(sale.sale_date)} • {sale.items?.length || 0} itens
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

                      {sale.status === 'faturada' && sale.payment_status !== 'pago' && (
                        <Button
                          size="sm"
                          onClick={() => { setSaleToPayment(sale); setIsPaymentDialogOpen(true); }}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          Receber
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSaleToEdit(sale); setIsEditDialogOpen(true); }}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Editar
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintReceipt(sale, 'thermal')}
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        Pedido
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-500 text-green-600 hover:bg-green-50"
                        onClick={() => handleSendWhatsApp(sale, contacts.find(c => c.id === sale.client_id))}
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        WhatsApp
                      </Button>

                      {sale.status !== 'cancelada' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-400 text-red-600 hover:bg-red-50"
                          onClick={() => { setSaleToCancel(sale); setIsCancelDialogOpen(true); }}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancelar
                        </Button>
                      )}

                      {sale.status === 'faturada' && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Receipt className="w-4 h-4 mr-1" />
                              Recibos
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-2">
                              <p className="font-semibold text-sm mb-3">Recibos de Pagamento</p>
                              {sale.paid_amount > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full justify-start"
                                  onClick={async () => {
                                    const payments = await base44.entities.SalePayment.filter({ sale_id: sale.id }, 'payment_date');
                                    if (payments.length > 0) {
                                      payments.forEach(p => handlePrintPaymentReceipt(sale, p.id));
                                    }
                                  }}
                                >
                                  Ver Todos os Recibos
                                </Button>
                              ) : (
                                <p className="text-xs text-slate-500">Nenhum pagamento registrado</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
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