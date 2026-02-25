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
import { DollarSign, Plus, TrendingUp, TrendingDown, Calendar, AlertCircle, History, CheckCircle2, Check, ChevronsUpDown, Upload, Lock, Pencil, Zap, ScanLine, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, getTodayDate, formatDate } from "@/components/utils/formatters";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/components/utils/categories";
import { isSameDay, isSameWeek, isSameMonth, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Transactions() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState(''); // NOVO: campo de pesquisa
  const [openCombobox, setOpenCombobox] = useState(false);
  const [openCategoryCombobox, setOpenCategoryCombobox] = useState(false);

  const [viewingPayments, setViewingPayments] = useState(null);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [isReceivePayOpen, setIsReceivePayOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  
  // Password Edit States
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingEditTransaction, setPendingEditTransaction] = useState(null);

  // Import States
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importType, setImportType] = useState('receita');
  const [importAccountId, setImportAccountId] = useState("");

  // Upload Receipt States
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);

  // Quick Entry States
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [quickFormData, setQuickFormData] = useState({
    description: "",
    amount: 0,
    type: "despesa",
    category: "",
    account_id: ""
  });

  const [paymentFormData, setPaymentFormData] = useState({
    amount: 0,
    payment_date: getTodayDate(),
    account_id: "",
    payment_method: "dinheiro",
    discount: 0,
    notes: ""
  });

  const defaultCategories = [
    "Combustível",
    "Manutenção Veículos",
    "Peças",
    "Salários",
    "Alimentação",
    "Serviços Terceiros",
    "Impostos",
    "Aluguel",
    "Energia Elétrica",
    "Água/Esgoto",
    "Internet/Telefone",
    "Material de Escritório",
    "Material de Construção",
    "EPIs",
    "Marketing",
    "Vendas",
    "Distribuição entre Filiais",
    "Empréstimo entre Filiais",
    "Pró-labore",
    "Outros"
  ];

  const [formData, setFormData] = useState({
  description: "",
  amount: 0,
  original_amount: 0,
  discount_type: "valor",
  discount_value: 0,
  type: "receita",
  category: "",
  status: "pendente",
  due_date: getTodayDate(),
  payment_date: "",
  account_id: "",
  contact_id: "",
  cost_center: "",
  notes: ""
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
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

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true }),
    initialData: []
  });

  const { data: paymentHistory = [] } = useQuery({
    queryKey: ['payment-history', viewingPayments?.id],
    queryFn: () => {
      if (!viewingPayments?.id) return [];
      return base44.entities.TransactionPayment.filter({ 
        transaction_id: viewingPayments.id
      }, '-payment_date');
    },
    enabled: !!viewingPayments?.id,
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const transaction = await base44.entities.Transaction.create({
        ...data,
        company_id: selectedCompanyId,
        paid_amount: data.status === 'pago' ? data.amount : 0
      });

      if (data.status === 'pago' && data.account_id) {
        const account = accounts.find(a => a.id === data.account_id);
        if (account) {
          // Registrar histórico de pagamento inicial
          const user = await base44.auth.me();
          await base44.entities.TransactionPayment.create({
            transaction_id: transaction.id,
            transaction_reference: transaction.description,
            amount: data.amount,
            payment_date: data.payment_date || getTodayDate(),
            account_id: data.account_id,
            account_name: account.name,
            payment_method: 'dinheiro', // Default
            responsible: user?.full_name || user?.email || '',
            notes: 'Pagamento registrado na criação',
            company_id: selectedCompanyId
          });
        }
      }
      return transaction;
    },
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Lançamento criado com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data),
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Lançamento atualizado!");
    }
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async ({ id, amount, discount, date, accountId, paymentMethod, notes }) => {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) throw new Error("Transação não encontrada");

      const currentPaidAmount = transaction.paid_amount || 0;
      const currentDiscount = transaction.discount || 0;
      
      let newPaidAmount = currentPaidAmount + amount;
      let newDiscount = currentDiscount + (discount || 0);

      const totalAccounted = newPaidAmount + newDiscount;
      
      // Se o total contabilizado passar do valor da transação, ajustamos o desconto
      // (Priorizamos o valor pago real, o desconto é o que sobra)
      if (totalAccounted > transaction.amount) {
         // Se só o pago já passou, limitamos o pago
         if (newPaidAmount > transaction.amount) {
             newPaidAmount = transaction.amount;
             newDiscount = 0;
         } else {
             // Se pago + desconto passou, reduzimos o desconto
             newDiscount = transaction.amount - newPaidAmount;
         }
      }

      const remainingAmount = transaction.amount - newPaidAmount - newDiscount;

      let newStatus = 'pendente';
      if (remainingAmount <= 0.005) {
        newStatus = 'pago';
      } else if (newPaidAmount > 0) {
        newStatus = 'parcial';
      }

      let transactionNotes = transaction.notes || '';
      const saldoMatch = transactionNotes.match(/[Ss]aldo\s+restante:?\s*R?\$?\s*([\d.,]+)/i);

      const formattedRemaining = formatBRL(remainingAmount);

      if (remainingAmount <= 0.005) {
        transactionNotes = transactionNotes.replace(/[Ss]aldo\s+restante:?\s*R?\$?\s*([\d.,]+)/i, '').trim();
      } else {
        const saldoText = `Saldo restante: ${formattedRemaining}`;
        if (saldoMatch) {
          transactionNotes = transactionNotes.replace(saldoMatch[0], saldoText);
        } else {
          if (transactionNotes) transactionNotes += '\n';
          transactionNotes += saldoText;
        }
      }
      transactionNotes = transactionNotes.replace(/\n\s*\n/g, '\n').trim();

      await base44.entities.Transaction.update(id, {
        paid_amount: newPaidAmount,
        discount: newDiscount,
        status: newStatus,
        payment_date: newStatus === 'pago' ? date : transaction.payment_date,
        account_id: accountId || transaction.account_id,
        notes: transactionNotes
      });

      const account = accounts.find(a => a.id === accountId);
      const user = await base44.auth.me();
      
      await base44.entities.TransactionPayment.create({
        transaction_id: id,
        transaction_reference: transaction.description,
        amount: amount,
        discount: discount || 0,
        payment_date: date,
        account_id: accountId,
        account_name: account?.name || '',
        payment_method: paymentMethod || 'dinheiro',
        responsible: user?.full_name || user?.email || '',
        notes: notes || '',
        company_id: selectedCompanyId
      });

      return { transaction, newStatus, newPaidAmount, remainingAmount };
    },
    onSuccess: ({ newStatus, remainingAmount }) => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      setIsReceivePayOpen(false);
      setSelectedTransaction(null);
      setPaymentFormData({
      amount: 0,
      discount: 0,
      payment_date: getTodayDate(),
      account_id: "",
      payment_method: "dinheiro",
      notes: ""
      });

      if (newStatus === 'pago') {
        toast.success("✅ Pagamento registrado e transação concluída!");
      } else {
        toast.success(`💰 Abatimento registrado! Saldo restante: ${formatBRL(remainingAmount)}`);
      }
    },
    onError: (error) => {
      toast.error("Erro ao registrar pagamento: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      description: "",
      amount: 0,
      original_amount: 0,
      discount_type: "valor",
      discount_value: 0,
      type: "receita",
      category: "",
      status: "pendente",
      due_date: getTodayDate(),
      payment_date: "",
      account_id: "",
      contact_id: "",
      cost_center: "",
      notes: ""
    });
    setEditingTransaction(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Calcular valores finais
    const original = parseFloat(formData.original_amount || 0);
    const discVal = parseFloat(formData.discount_value || 0);
    let finalAmount = original;
    let totalDiscount = 0;

    if (formData.discount_type === 'porcentagem') {
      totalDiscount = (original * discVal) / 100;
      finalAmount = original - totalDiscount;
    } else {
      totalDiscount = discVal;
      finalAmount = original - totalDiscount;
    }

    const dataToSubmit = {
       ...formData,
       amount: finalAmount, // Valor Líquido
       discount: totalDiscount, // Valor total do desconto em R$
       original_amount: original,
       discount_type: formData.discount_type,
       discount_value: discVal,
       paid_amount: formData.status === 'pago' ? finalAmount : (formData.paid_amount || 0)
    };

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const initiateEdit = (transaction) => {
    setPendingEditTransaction(transaction);
    setPasswordInput("");
    setIsPasswordDialogOpen(true);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === "1234") {
      setIsPasswordDialogOpen(false);
      const transaction = pendingEditTransaction;
      
      setEditingTransaction(transaction);
      setFormData({
        description: transaction.description || "",
        amount: transaction.amount || 0,
        original_amount: transaction.original_amount || transaction.amount || 0, // Fallback para amount se original não existir
        discount_type: transaction.discount_type || "valor",
        discount_value: transaction.discount_value || 0,
        type: transaction.type || "receita",
        category: transaction.category || "",
        status: transaction.status || "pendente",
        due_date: transaction.due_date || new Date().toISOString().split('T')[0],
        payment_date: transaction.payment_date || "",
        account_id: transaction.account_id || "",
        contact_id: transaction.contact_id || "",
        cost_center: transaction.cost_center || "",
        notes: transaction.notes || ""
      });
      setIsDialogOpen(true);
      setPendingEditTransaction(null);
      toast.success("Acesso autorizado!");
    } else {
      toast.error("Senha incorreta!");
    }
  };

  const handleReadReceipt = async () => {
    if (!receiptFile) {
      toast.error("Selecione uma imagem ou PDF do comprovante");
      return;
    }

    setIsReadingReceipt(true);
    try {
      // 1. Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: receiptFile
      });

      // 2. Extract Data using AI
      const extractionSchema = {
        type: "object",
        properties: {
          description: { type: "string", description: "Breve descrição do que foi gasto/comprado" },
          amount: { type: "number", description: "Valor total da transação" },
          date: { type: "string", format: "date", description: "Data da transação (YYYY-MM-DD)" },
          supplier_name: { type: "string", description: "Nome do estabelecimento/fornecedor" },
          category_suggestion: { type: "string", description: "Sugestão de categoria para despesa" }
        },
        required: ["amount", "description"]
      };

      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: file_url,
        json_schema: extractionSchema
      });

      if (result.status === 'success' && result.output) {
        const data = result.output;
        
        // Find existing contact or use name
        let contactId = "";
        if (data.supplier_name) {
            const existingContact = contacts.find(c => 
                c.name.toLowerCase().includes(data.supplier_name.toLowerCase()) || 
                data.supplier_name.toLowerCase().includes(c.name.toLowerCase())
            );
            if (existingContact) contactId = existingContact.id;
        }

        // Pre-fill form
        setFormData({
            description: data.description || "Despesa importada",
            amount: data.amount || 0,
            original_amount: data.amount || 0,
            discount_type: "valor",
            discount_value: 0,
            type: "despesa",
            category: data.category_suggestion || "",
            status: "pago", // Usually receipts are already paid
            due_date: data.date || getTodayDate(),
            payment_date: data.date || getTodayDate(),
            account_id: "", // User must select
            contact_id: contactId,
            cost_center: "",
            notes: `Importado de comprovante: ${data.supplier_name || 'Desconhecido'}`
        });

        setIsUploadDialogOpen(false);
        setIsDialogOpen(true); // Open the main create dialog with data
        toast.success("Dados extraídos! Revise e salve o lançamento.");
      } else {
        throw new Error("Não foi possível ler os dados do comprovante.");
      }

    } catch (error) {
      console.error(error);
      toast.error("Erro ao ler comprovante: " + error.message);
    } finally {
      setIsReadingReceipt(false);
      setReceiptFile(null);
    }
  };

  const handleImportFile = async (e) => {
    e.preventDefault();
    if (!importFile) {
      toast.error("Selecione um arquivo CSV");
      return;
    }
    if (!importAccountId) {
      toast.error("Selecione uma conta para os lançamentos pagos");
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        let successCount = 0;
        let totalAdjustment = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          
          if (values.length < 2) continue;

          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index];
          });

          // Construct transaction object
          const description = row['descricao'] || row['descrição'] || 'Importado via CSV';
          const amount = parseFloat((row['valor'] || '0').replace('R$', '').replace('.', '').replace(',', '.'));
          const validAmount = isNaN(amount) ? 0 : amount;
          
          // Use selected type for all imported items
          const type = importType;
          
          const category = row['categoria'] || 'Geral';
          const dueDate = row['vencimento'] || row['data'] || getTodayDate();
          
          // Create Transaction with status 'pago'
          await base44.entities.Transaction.create({
            description,
            amount: validAmount,
            original_amount: validAmount,
            discount_type: "valor",
            discount_value: 0,
            type,
            category,
            status: 'pago', 
            paid_amount: validAmount,
            due_date: dueDate,
            payment_date: dueDate, // Assume paid on due date/import date
            account_id: importAccountId,
            company_id: selectedCompanyId,
            notes: `Importado em ${formatDate(getTodayDate())} (Pago)`
          });

          // Calculate adjustment
          if (type === 'receita') {
            totalAdjustment += validAmount;
          } else {
            totalAdjustment -= validAmount;
          }
          
          successCount++;
        }

        await base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
        queryClient.invalidateQueries(['transactions']);
        queryClient.invalidateQueries(['accounts']);
        setIsImportDialogOpen(false);
        setImportFile(null);
        toast.success(`${successCount} lançamentos importados e marcados como pagos!`);
      } catch (error) {
        console.error(error);
        toast.error("Erro ao processar arquivo: " + error.message);
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsText(importFile);
  };

  const handleReceivePay = (transaction) => {
    setSelectedTransaction(transaction);
    setPaymentFormData({
      amount: transaction.amount - (transaction.paid_amount || 0) - (transaction.discount || 0),
      discount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      account_id: transaction.account_id || "",
      payment_method: "dinheiro",
      notes: ""
    });
    setIsReceivePayOpen(true);
  };

  const handleViewPayments = (transaction) => {
    setViewingPayments(transaction);
    setIsPaymentHistoryOpen(true);
  };

  const handleRegisterPayment = () => {
    if (!selectedTransaction) return;
    if (paymentFormData.amount <= 0) {
      toast.error("Valor deve ser maior que zero!");
      return;
    }
    if (!paymentFormData.account_id) {
      toast.error("Selecione uma conta!");
      return;
    }

    registerPaymentMutation.mutate({
      id: selectedTransaction.id,
      amount: parseFloat(paymentFormData.amount),
      discount: parseFloat(paymentFormData.discount || 0),
      date: paymentFormData.payment_date,
      accountId: paymentFormData.account_id,
      paymentMethod: paymentFormData.payment_method,
      notes: paymentFormData.notes
    });
  };

  const quickEntryMutation = useMutation({
    mutationFn: async (data) => {
      const transaction = await base44.entities.Transaction.create({
        description: data.description,
        amount: data.amount,
        original_amount: data.amount,
        discount_type: "valor",
        discount_value: 0,
        type: data.type,
        category: data.category,
        status: 'pago',
        due_date: getTodayDate(),
        payment_date: getTodayDate(),
        account_id: data.account_id,
        company_id: selectedCompanyId,
        paid_amount: data.amount,
        notes: 'Lançamento rápido'
      });

      const account = accounts.find(a => a.id === data.account_id);
      if (account) {
        const user = await base44.auth.me();
        await base44.entities.TransactionPayment.create({
          transaction_id: transaction.id,
          transaction_reference: transaction.description,
          amount: data.amount,
          payment_date: getTodayDate(),
          account_id: data.account_id,
          account_name: account.name,
          payment_method: 'dinheiro',
          responsible: user?.full_name || user?.email || '',
          notes: 'Lançamento rápido',
          company_id: selectedCompanyId
        });
      }
      return transaction;
    },
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      setIsQuickEntryOpen(false);
      setQuickFormData({
        description: "",
        amount: 0,
        type: "despesa",
        category: "",
        account_id: ""
      });
      toast.success("✅ Lançamento rápido criado!");
    }
  });

  const handleQuickEntry = (e) => {
    e.preventDefault();

    const amount = quickFormData.amount === '' ? 0 : parseFloat(quickFormData.amount);

    if (!quickFormData.description || !quickFormData.account_id || amount <= 0) {
      toast.error("Preencha todos os campos obrigatórios!");
      return;
    }
    quickEntryMutation.mutate({ ...quickFormData, amount });
  };

  // ATUALIZAR: Adicionar pesquisa ao filtro
  const filteredTransactions = transactions.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;

    // Date Filter
    if (dateFilter !== 'all') {
        const today = new Date();
        // Se pago, usa data pagamento, senão data vencimento
        const dateToCheck = t.status === 'pago' && t.payment_date 
            ? parseISO(t.payment_date) 
            : parseISO(t.due_date);
            
        if (dateFilter === 'today' && !isSameDay(dateToCheck, today)) return false;
        if (dateFilter === 'week' && !isSameWeek(dateToCheck, today)) return false;
        if (dateFilter === 'month' && !isSameMonth(dateToCheck, today)) return false;
        if (dateFilter === 'custom' && customDates.start && customDates.end) {
            const start = startOfDay(parseISO(customDates.start));
            const end = endOfDay(parseISO(customDates.end));
            if (!isWithinInterval(dateToCheck, { start, end })) return false;
        }
    }
    
    // Pesquisa por descrição, contato, categoria ou observação
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchDescription = t.description?.toLowerCase().includes(search);
      const matchContact = t.contact_name?.toLowerCase().includes(search);
      const matchCategory = t.category?.toLowerCase().includes(search);
      const matchNotes = t.notes?.toLowerCase().includes(search);
      if (!matchDescription && !matchContact && !matchCategory && !matchNotes) return false;
    }
    
    return true;
  });

  // NOVO: Função para calcular status da data
  const getDateStatus = (transaction) => {
    if (transaction.status === 'pago') return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dueDate = new Date(transaction.due_date);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { type: 'atrasado', text: `${Math.abs(diffDays)} dia(s) atrasado`, color: 'text-red-600 bg-red-50' };
    } else if (diffDays === 0) {
      return { type: 'hoje', text: 'Vence hoje', color: 'text-orange-600 bg-orange-50' };
    } else if (diffDays <= 7 && diffDays > 0) { // Only show if future, not today
      return { type: 'proximo', text: `Vence em ${diffDays} dia(s)`, color: 'text-yellow-600 bg-yellow-50' };
    }
    return null;
  };

  const totalReceita = transactions
    .filter(t => t.type === 'receita' && t.status === 'pago')
    .reduce((sum, t) => sum + (t.paid_amount || 0), 0);

  const totalDespesa = transactions
    .filter(t => t.type === 'despesa' && t.status === 'pago')
    .reduce((sum, t) => sum + (t.paid_amount || 0), 0);

  const pendingReceivables = transactions
    .filter(t => t.type === 'receita' && t.status !== 'pago')
    .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

  const pendingPayables = transactions
    .filter(t => t.type === 'despesa' && t.status !== 'pago')
    .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

  // Calcular Saldo Líquido (Receitas Pagas - Despesas Pagas)
  const saldoLiquido = totalReceita - totalDespesa;

  // Calcular Médias Diárias (baseado nos filtrados)
  const dailyAverages = React.useMemo(() => {
    if (filteredTransactions.length === 0) return { receita: 0, despesa: 0, days: 0 };
    
    // Encontrar range de datas dos filtrados
    const dates = filteredTransactions
        .map(t => t.payment_date || t.due_date)
        .filter(Boolean)
        .map(d => new Date(d).getTime());
    
    if (dates.length === 0) return { receita: 0, despesa: 0, days: 0 };

    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const diffTime = Math.abs(maxDate - minDate);
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const totalRev = filteredTransactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);
    const totalExp = filteredTransactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);

    return {
        receita: totalRev / diffDays,
        despesa: totalExp / diffDays,
        days: diffDays
    };
  }, [filteredTransactions]);

  const statusColors = {
    pendente: "bg-yellow-100 text-yellow-800",
    pago: "bg-green-100 text-green-800",
    atrasado: "bg-red-100 text-red-800",
    parcial: "bg-orange-100 text-orange-800"
  };

  // Dados do gráfico de fluxo de caixa diário
  const dailyCashFlow = React.useMemo(() => {
    const grouped = {};

    filteredTransactions.forEach(t => {
      if (t.status === 'pago' && t.payment_date) {
        const date = t.payment_date;
        if (!grouped[date]) grouped[date] = { date, receita: 0, despesa: 0 };
        if (t.type === 'receita') grouped[date].receita += (t.paid_amount || 0);
        else grouped[date].despesa += (t.paid_amount || 0);
      }
    });

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
         ...item,
         formattedDate: formatDate(item.date).slice(0, 5) // DD/MM
      }));
  }, [filteredTransactions]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Lançamentos Financeiros</h1>
          <p className="text-slate-500 mt-1">Receitas e despesas</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200">
                <ScanLine className="w-4 h-4" />
                Ler Comprovante
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-blue-600" />
                  Ler Comprovante com IA
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                 <div className="p-4 bg-blue-50 text-blue-800 rounded-lg text-sm flex gap-3">
                    <FileText className="w-8 h-8 flex-shrink-0" />
                    <div>
                        <p className="font-semibold mb-1">Como funciona?</p>
                        <p>Envie uma foto ou PDF do seu comprovante de pagamento. Nossa IA irá ler os dados automaticamente e preencher o lançamento para você.</p>
                    </div>
                 </div>
                 
                 <div className="space-y-2">
                   <Label>Arquivo (Imagem ou PDF)</Label>
                   <Input 
                     type="file" 
                     accept="image/*,.pdf"
                     onChange={(e) => setReceiptFile(e.target.files[0])}
                   />
                 </div>

                 <div className="flex justify-end gap-2">
                   <Button variant="ghost" onClick={() => setIsUploadDialogOpen(false)}>Cancelar</Button>
                   <Button 
                     onClick={handleReadReceipt} 
                     disabled={isReadingReceipt || !receiptFile}
                     className="bg-blue-600 hover:bg-blue-700"
                   >
                     {isReadingReceipt ? (
                        <>
                            <ScanLine className="w-4 h-4 mr-2 animate-pulse" />
                            Lendo Comprovante...
                        </>
                     ) : (
                        <>
                            <ScanLine className="w-4 h-4 mr-2" />
                            Processar
                        </>
                     )}
                   </Button>
                 </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isQuickEntryOpen} onOpenChange={setIsQuickEntryOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200">
                <Zap className="w-4 h-4" />
                Lançamento Rápido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                  Lançamento Rápido
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleQuickEntry} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select
                      required
                      value={quickFormData.type}
                      onValueChange={(value) => setQuickFormData({ ...quickFormData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">💰 Receita</SelectItem>
                        <SelectItem value="despesa">💸 Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={quickFormData.amount}
                      onChange={(e) => setQuickFormData({ ...quickFormData, amount: e.target.value === '' ? '' : e.target.value })}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  <Input
                    required
                    value={quickFormData.description}
                    onChange={(e) => setQuickFormData({ ...quickFormData, description: e.target.value })}
                    placeholder="Ex: Almoço, Combustível..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select
                    required
                    value={quickFormData.category}
                    onValueChange={(value) => setQuickFormData({ ...quickFormData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Conta *</Label>
                  <Select
                    required
                    value={quickFormData.account_id}
                    onValueChange={(value) => setQuickFormData({ ...quickFormData, account_id: value })}
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

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsQuickEntryOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={quickEntryMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                    <Zap className="w-4 h-4 mr-2" />
                    {quickEntryMutation.isPending ? "Criando..." : "Registrar Agora"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="w-4 h-4" />
                Importar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar Lançamentos (CSV)</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-600 space-y-2">
                  <p className="font-semibold">Formato esperado do CSV:</p>
                  <p>descricao, valor, tipo, categoria, vencimento</p>
                  <p className="text-xs text-slate-400">Ex: Pagamento Luz, 150.00, despesa, Energia, 2023-12-01</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Lançamento</Label>
                    <Select value={importType} onValueChange={setImportType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="despesa">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Conta (Pago)</Label>
                    <Select value={importAccountId} onValueChange={setImportAccountId}>
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
                <div className="space-y-2">
                  <Label>Arquivo CSV</Label>
                  <Input 
                    type="file" 
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files[0])}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsImportDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleImportFile} disabled={isImporting || !importFile}>
                    {isImporting ? 'Importando...' : 'Processar Importação'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Lançamento
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTransaction ? "Editar" : "Novo"} Lançamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs defaultValue="dados">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo *</Label>
                      <Select
                        required
                        value={formData.type}
                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receita">💰 Receita</SelectItem>
                          <SelectItem value="despesa">💸 Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Valor Original (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={formData.original_amount}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value || 0);
                            setFormData(prev => {
                                const discVal = parseFloat(prev.discount_value || 0);
                                const disc = prev.discount_type === 'porcentagem' 
                                    ? (val * discVal / 100) 
                                    : discVal;
                                return { ...prev, original_amount: e.target.value, amount: val - disc };
                            });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                        <Label>Desconto</Label>
                        <div className="flex gap-2">
                            <Select 
                                value={formData.discount_type} 
                                onValueChange={(val) => {
                                    setFormData(prev => {
                                        const orig = parseFloat(prev.original_amount || 0);
                                        const discVal = parseFloat(prev.discount_value || 0);
                                        const disc = val === 'porcentagem' 
                                            ? (orig * discVal / 100) 
                                            : discVal;
                                        return { ...prev, discount_type: val, amount: orig - disc };
                                    });
                                }}
                            >
                                <SelectTrigger className="w-[80px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="valor">R$</SelectItem>
                                    <SelectItem value="porcentagem">%</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                type="number"
                                step="0.01"
                                value={formData.discount_value}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value || 0);
                                    setFormData(prev => {
                                        const orig = parseFloat(prev.original_amount || 0);
                                        const disc = prev.discount_type === 'porcentagem' 
                                            ? (orig * val / 100) 
                                            : val;
                                        return { ...prev, discount_value: e.target.value, amount: orig - disc };
                                    });
                                }}
                                placeholder={formData.discount_type === 'porcentagem' ? "%" : "R$"}
                            />
                        </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border flex justify-between items-center mb-4">
                      <span className="text-sm font-medium text-slate-500">Valor Líquido (Final):</span>
                      <span className={`text-lg font-bold ${formData.type === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBRL(formData.amount)}
                      </span>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição *</Label>
                    <Input
                      required
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={formData.type === 'receita' ? "Ex: Venda de Mercadoria" : "Ex: Compra de Material"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 flex flex-col">
                      <Label>{formData.type === 'receita' ? 'Categoria de Receita' : 'Categoria de Despesa'}</Label>
                      <Popover open={openCategoryCombobox} onOpenChange={setOpenCategoryCombobox}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCategoryCombobox}
                            className="justify-between w-full font-normal"
                          >
                            {formData.category || "Selecione..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command>
                            <CommandInput 
                              placeholder="Buscar categoria..." 
                              onValueChange={(search) => {
                                if (search && !defaultCategories.includes(search)) {
                                  setFormData(prev => ({ ...prev, category: search }));
                                }
                              }}
                            />
                            <CommandList>
                              <CommandEmpty>Digite para criar nova.</CommandEmpty>
                              <CommandGroup heading="Sugestões">
                                {defaultCategories.map((category) => (
                                  <CommandItem
                                    key={category}
                                    value={category}
                                    onSelect={(currentValue) => {
                                      setFormData({ ...formData, category: currentValue });
                                      setOpenCategoryCombobox(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.category === category ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {category}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <Label>{formData.type === 'receita' ? 'Cliente' : 'Fornecedor'}</Label>
                      <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCombobox}
                            className="justify-between w-full font-normal"
                          >
                            {formData.contact_id
                              ? contacts.find((contact) => contact.id === formData.contact_id)?.name
                              : "Selecione..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Pesquisar..." />
                            <CommandList>
                              <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                              <CommandGroup>
                                {contacts
                                  .filter(c => {
                                    if (formData.type === 'receita') return c.type === 'cliente' || c.type === 'ambos';
                                    return c.type === 'fornecedor' || c.type === 'ambos';
                                  })
                                  .map((contact) => (
                                  <CommandItem
                                    key={contact.id}
                                    value={contact.name}
                                    onSelect={() => {
                                      setFormData({ ...formData, contact_id: contact.id });
                                      setOpenCombobox(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.contact_id === contact.id ? "opacity-100" : "opacity-0"
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
                  </div>

                  {formData.type === 'despesa' && (
                    <div className="space-y-2">
                       <Label>Centro de Custo</Label>
                       <Input 
                          value={formData.cost_center} 
                          onChange={e => setFormData({...formData, cost_center: e.target.value})} 
                          placeholder="Ex: Administrativo, Frota, Obras..."
                       />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Data de Vencimento *</Label>
                    <Input
                      type="date"
                      required
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="pagamento" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select
                      required
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="atrasado">Atrasado</SelectItem>
                        <SelectItem value="parcial">Parcial</SelectItem> {/* Added Partial status */}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.status === 'pago' && (
                    <>
                      <div className="space-y-2">
                        <Label>Data de Pagamento *</Label>
                        <Input
                          type="date"
                          required
                          value={formData.payment_date}
                          onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Conta *</Label>
                        <Select
                          required
                          value={formData.account_id}
                          onValueChange={(value) => setFormData({ ...formData, account_id: value })}
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
                    </>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingTransaction ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Dialog Receber/Pagar (Abatimento) */}
      <Dialog open={isReceivePayOpen} onOpenChange={setIsReceivePayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTransaction?.type === 'receita' ? '💰 Receber' : '💸 Pagar'} - Abatimento
            </DialogTitle>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-4">
              <Card className="bg-slate-50">
                <CardContent className="pt-6">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Valor Total:</span>
                      <span className="font-bold">{formatBRL(selectedTransaction.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Já Pago:</span>
                      <span className="text-green-600 font-medium">{formatBRL(selectedTransaction.paid_amount || 0)}</span>
                    </div>
                    {(selectedTransaction.discount > 0) && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Descontos:</span>
                        <span className="text-red-500 font-medium">{formatBRL(selectedTransaction.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-slate-600 font-medium">Saldo Restante:</span>
                      <span className="text-orange-600 font-bold text-lg">
                        {formatBRL(selectedTransaction.amount - (selectedTransaction.paid_amount || 0) - (selectedTransaction.discount || 0))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor a {selectedTransaction.type === 'receita' ? 'Receber' : 'Pagar'} *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value === '' ? '' : e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Desconto concedido</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentFormData.discount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, discount: e.target.value === '' ? '' : e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Saldo Restante: {formatBRL(selectedTransaction.amount - (selectedTransaction.paid_amount || 0) - (selectedTransaction.discount || 0))}
                </div>

                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input
                    type="date"
                    required
                    value={paymentFormData.payment_date}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conta *</Label>
                  <Select
                    required
                    value={paymentFormData.account_id}
                    onValueChange={(value) => setPaymentFormData({ ...paymentFormData, account_id: value })}
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

                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select
                    value={paymentFormData.payment_method}
                    onValueChange={(value) => setPaymentFormData({ ...paymentFormData, payment_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                      <SelectItem value="pix">📱 PIX</SelectItem>
                      <SelectItem value="transferencia">🏦 Transferência</SelectItem>
                      <SelectItem value="cartao_debito">💳 Cartão Débito</SelectItem>
                      <SelectItem value="cartao_credito">💳 Cartão Crédito</SelectItem>
                      <SelectItem value="cheque">📝 Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={paymentFormData.notes}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                    rows={2}
                    placeholder="Ex: Referente à parcela 1/3"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsReceivePayOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleRegisterPayment}
                  disabled={registerPaymentMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {registerPaymentMutation.isPending ? "Registrando..." : "Registrar Abatimento"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Senha para Edição */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Autorização Necessária
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Senha de Administrador</Label>
              <Input 
                type="password" 
                placeholder="Digite a senha..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsPasswordDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">Confirmar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Histórico de Pagamentos */}
      <Dialog open={isPaymentHistoryOpen} onOpenChange={setIsPaymentHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>📋 Histórico de Abatimentos</DialogTitle>
          </DialogHeader>

          {viewingPayments && (
            <div className="space-y-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <h3 className="font-bold text-lg mb-2">{viewingPayments.description}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">Valor Total:</span>
                      <p className="font-bold text-lg">{formatBRL(viewingPayments.amount)}</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Status:</span>
                      <div className="mt-1">
                        <Badge className={statusColors[viewingPayments.status]}>
                          {viewingPayments.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-600">Total Pago:</span>
                      <p className="font-bold text-green-600">{formatBRL(viewingPayments.paid_amount || 0)}</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Descontos:</span>
                      <p className="font-bold text-red-500">{formatBRL(viewingPayments.discount || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Movimentações (Abatimentos)
                </h4>

                {paymentHistory.length > 0 ? (
                  <div className="space-y-2">
                    {paymentHistory.map((payment, idx) => (
                      <Card key={payment.id} className="bg-white">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  #{paymentHistory.length - idx}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {formatDate(payment.payment_date)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600">
                                {payment.account_name} • {payment.payment_method}
                              </p>
                              {payment.notes && (
                                <p className="text-xs text-slate-500 mt-1">{payment.notes}</p>
                              )}
                              {payment.responsible && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Por: {payment.responsible}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-600 text-lg">
                                {formatBRL(payment.amount)}
                              </p>
                              {(payment.discount > 0) && (
                                <p className="text-xs text-red-500">
                                  Desc: {formatBRL(payment.discount)}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum abatimento registrado ainda</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Receitas</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(totalReceita)}</div>
            <p className="text-xs text-green-200 mt-1">Recebido</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-100">Despesas</CardTitle>
            <TrendingDown className="h-5 w-5 text-red-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(totalDespesa)}</div>
            <p className="text-xs text-red-200 mt-1">Pago</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Líquido</CardTitle>
            <DollarSign className={`h-5 w-5 ${saldoLiquido >= 0 ? 'text-green-500' : 'text-red-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${saldoLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatBRL(saldoLiquido)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Receitas - Despesas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">A Receber</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(pendingReceivables)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">A Pagar</CardTitle>
            <AlertCircle className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(pendingPayables)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico e Médias */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Movimentação de Caixa Diária</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyCashFlow}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="formattedDate" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatBRL(value)}
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Legend />
                    <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
                <CardTitle>Médias Diárias (Filtrado)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
                    <div>
                        <p className="text-sm text-green-900 font-medium">Entrada Média</p>
                        <p className="text-xs text-green-600">Base: {dailyAverages.days} dias</p>
                    </div>
                    <span className="text-lg font-bold text-green-700">{formatBRL(dailyAverages.receita)}</span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                    <div>
                        <p className="text-sm text-red-900 font-medium">Saída Média</p>
                        <p className="text-xs text-red-600">Base: {dailyAverages.days} dias</p>
                    </div>
                    <span className="text-lg font-bold text-red-700">{formatBRL(dailyAverages.despesa)}</span>
                </div>

                <div className="pt-4 border-t">
                    <p className="text-sm text-slate-500 mb-2 text-center">Saldo Diário Médio</p>
                    <div className={`text-2xl font-bold text-center ${dailyAverages.receita - dailyAverages.despesa >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {formatBRL(dailyAverages.receita - dailyAverages.despesa)}
                    </div>
                </div>
            </CardContent>
          </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="🔍 Pesquisar por descrição, contato ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo Período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  value={customDates.start}
                  onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
                  className="w-auto"
                />
                <span className="text-slate-400">até</span>
                <Input 
                  type="date" 
                  value={customDates.end}
                  onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
                  className="w-auto"
                />
              </div>
            )}

            {(searchTerm || filterType !== 'all' || filterStatus !== 'all' || dateFilter !== 'all') && (
                <Button 
                    variant="ghost" 
                    onClick={() => {
                        setSearchTerm('');
                        setFilterType('all');
                        setFilterStatus('all');
                        setDateFilter('all');
                    }}
                    className="ml-auto text-slate-500 hover:text-red-600"
                >
                    Limpar Filtros
                </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Transações */}
      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => {
              const remainingAmount = transaction.amount - (transaction.paid_amount || 0) - (transaction.discount || 0);
              const hasPayments = (transaction.paid_amount || 0) > 0;
              const dateStatus = getDateStatus(transaction);

              return (
                <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      transaction.type === 'receita' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {transaction.type === 'receita' ? (
                        <TrendingUp className="w-6 h-6 text-green-600" />
                      ) : (
                        <TrendingDown className="w-6 h-6 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={statusColors[transaction.status]}>
                          {transaction.status}
                        </Badge>
                        {transaction.category && (
                          <span className="text-xs text-slate-500">{transaction.category}</span>
                        )}
                        {transaction.contact_name && (
                          <span className="text-xs text-slate-500">• {transaction.contact_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Venc: {formatDate(transaction.due_date)}
                        </p>
                        {dateStatus && (
                          <Badge variant="outline" className={`text-xs ${dateStatus.color} border-current`}>
                            {dateStatus.text}
                          </Badge>
                        )}
                        {transaction.payment_date && transaction.status === 'pago' && (
                          <Badge variant="outline" className="text-xs text-green-600 bg-green-50 border-green-200">
                            Pago em: {formatDate(transaction.payment_date)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {(transaction.original_amount > transaction.amount) && (
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-slate-400 line-through">
                                {formatBRL(transaction.original_amount)}
                            </span>
                            {transaction.discount_type === 'porcentagem' && (
                                <span className="text-[10px] text-red-400 bg-red-50 px-1 rounded">
                                    -{transaction.discount_value}%
                                </span>
                            )}
                        </div>
                    )}
                    <p className={`text-xl font-bold ${
                      transaction.type === 'receita' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatBRL(transaction.amount)}
                    </p>
                    {hasPayments && (
                      <>
                        <p className="text-sm text-green-600">
                          Pago: {formatBRL(transaction.paid_amount)}
                        </p>
                        <p className="text-sm text-orange-600">
                          Restante: {formatBRL(remainingAmount)}
                        </p>
                      </>
                    )}
                    <div className="flex gap-2 mt-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => initiateEdit(transaction)}
                        className="text-slate-500 hover:text-blue-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {transaction.status !== 'pago' && (
                        <Button
                          size="sm"
                          onClick={() => handleReceivePay(transaction)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          {transaction.type === 'receita' ? 'Receber' : 'Pagar'}
                        </Button>
                      )}
                      {hasPayments && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewPayments(transaction)}
                        >
                          <History className="w-4 h-4 mr-1" />
                          Ver Histórico
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