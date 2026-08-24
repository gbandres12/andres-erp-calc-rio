import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, Plus, TrendingUp, TrendingDown, AlertCircle, History, Upload, Lock, ScanLine, FileText, Zap, Badge as BadgeIcon } from "lucide-react";
import DeleteAuthDialog from "@/components/sales/DeleteAuthDialog";
import { Badge } from "@/components/ui/badge";
import { formatBRL, getTodayDate, formatDate } from "@/components/utils/formatters";
import { isSameDay, isSameWeek, isSameMonth, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from "sonner";
import TransactionFormDialog from "@/components/transactions/TransactionFormDialog";
import QuickEntryDialog from "@/components/transactions/QuickEntryDialog";
import ReceivePayDialog from "@/components/transactions/ReceivePayDialog";
import TransactionRow from "@/components/transactions/TransactionRow";

export default function Transactions() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formInitialData, setFormInitialData] = useState(null);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [viewingPayments, setViewingPayments] = useState(null);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [isReceivePayOpen, setIsReceivePayOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingEditTransaction, setPendingEditTransaction] = useState(null);

  const [isDeleteAuthOpen, setIsDeleteAuthOpen] = useState(false);
  const [pendingDeleteTransaction, setPendingDeleteTransaction] = useState(null);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importType, setImportType] = useState('receita');
  const [importAccountId, setImportAccountId] = useState("");

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);

  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);

  // Debounce da pesquisa: o input fica instantâneo, só a lista refiltra depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: selectedCompanyId }, '-created_date'),
    initialData: []
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ company_id: selectedCompanyId, is_active: true }),
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
      return base44.entities.TransactionPayment.filter({ transaction_id: viewingPayments.id }, '-payment_date');
    },
    enabled: !!viewingPayments?.id,
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const transaction = await base44.entities.Transaction.create({
        ...data,
        company_id: selectedCompanyId,
        payment_date: data.status === 'pago' ? (data.payment_date || getTodayDate()) : data.payment_date,
        paid_amount: data.status === 'pago' ? data.amount : 0
      });
      if (data.status === 'pago' && data.account_id) {
        const account = accounts.find(a => a.id === data.account_id);
        if (account) {
          const user = await base44.auth.me();
          await base44.entities.TransactionPayment.create({
            transaction_id: transaction.id,
            transaction_reference: transaction.description,
            amount: data.amount,
            payment_date: data.payment_date || getTodayDate(),
            account_id: data.account_id,
            account_name: account.name,
            payment_method: 'dinheiro',
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
      closeFormDialog();
      toast.success("Lançamento criado com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const oldTx = transactions.find(t => t.id === id);
      const updateData = { ...data, payment_date: data.status === 'pago' ? (data.payment_date || getTodayDate()) : data.payment_date };
      const updated = await base44.entities.Transaction.update(id, updateData);
      const payments = await base44.entities.TransactionPayment.filter({ transaction_id: id });
      const wasPago = oldTx?.status === 'pago';
      const isPago = data.status === 'pago';
      const account = accounts.find(a => a.id === data.account_id);

      if (isPago) {
        if (payments.length === 0 && account) {
          const user = await base44.auth.me();
          await base44.entities.TransactionPayment.create({
            transaction_id: id,
            transaction_reference: data.description,
            amount: data.amount,
            payment_date: data.payment_date || getTodayDate(),
            account_id: data.account_id,
            account_name: account.name,
            payment_method: 'dinheiro',
            responsible: user?.full_name || user?.email || '',
            notes: 'Pagamento registrado na edição',
            company_id: selectedCompanyId
          });
        } else if (payments.length === 1) {
          await base44.entities.TransactionPayment.update(payments[0].id, {
            amount: data.amount,
            account_id: data.account_id,
            account_name: account?.name || payments[0].account_name,
            payment_date: data.payment_date || payments[0].payment_date,
            transaction_reference: data.description
          });
        }
      } else if (wasPago && !isPago && payments.length === 1) {
        await base44.entities.TransactionPayment.delete(payments[0].id);
      }
      return updated;
    },
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      closeFormDialog();
      toast.success("Lançamento atualizado!");
    }
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async ({ id, amount, discount, date, accountId, paymentMethod, notes, costCenter }) => {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) throw new Error("Transação não encontrada");

      const currentPaidAmount = transaction.paid_amount || 0;
      const currentDiscount = transaction.discount || 0;
      let newPaidAmount = currentPaidAmount + amount;
      let newDiscount = currentDiscount + (discount || 0);
      const totalAccounted = newPaidAmount + newDiscount;

      if (totalAccounted > transaction.amount) {
        if (newPaidAmount > transaction.amount) {
          newPaidAmount = transaction.amount;
          newDiscount = 0;
        } else {
          newDiscount = transaction.amount - newPaidAmount;
        }
      }

      const remainingAmount = transaction.amount - newPaidAmount - newDiscount;
      let newStatus = 'pendente';
      if (remainingAmount <= 0.005) newStatus = 'pago';
      else if (newPaidAmount > 0) newStatus = 'parcial';

      let transactionNotes = transaction.notes || '';
      const saldoMatch = transactionNotes.match(/[Ss]aldo\s+restante:?\s*R?\$?\s*([\d.,]+)/i);
      const formattedRemaining = formatBRL(remainingAmount);

      if (remainingAmount <= 0.005) {
        transactionNotes = transactionNotes.replace(/[Ss]aldo\s+restante:?\s*R?\$?\s*([\d.,]+)/i, '').trim();
      } else {
        const saldoText = `Saldo restante: ${formattedRemaining}`;
        if (saldoMatch) transactionNotes = transactionNotes.replace(saldoMatch[0], saldoText);
        else { if (transactionNotes) transactionNotes += '\n'; transactionNotes += saldoText; }
      }
      transactionNotes = transactionNotes.replace(/\n\s*\n/g, '\n').trim();

      await base44.entities.Transaction.update(id, {
        paid_amount: newPaidAmount,
        discount: newDiscount,
        status: newStatus,
        payment_date: newStatus === 'pago' ? date : transaction.payment_date,
        account_id: accountId || transaction.account_id,
        cost_center: costCenter || transaction.cost_center || "",
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
      if (newStatus === 'pago') toast.success("✅ Pagamento registrado e transação concluída!");
      else toast.success(`💰 Abatimento registrado! Saldo restante: ${formatBRL(remainingAmount)}`);
    },
    onError: (error) => toast.error("Erro ao registrar pagamento: " + error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => {
      base44.functions.invoke('recalculateBalance', { company_id: selectedCompanyId });
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      setIsDeleteAuthOpen(false);
      setPendingDeleteTransaction(null);
      toast.success("Lançamento excluído com sucesso!");
    },
    onError: (err) => toast.error("Erro ao excluir lançamento: " + err.message)
  });

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
      toast.success("✅ Lançamento rápido criado!");
    }
  });

  const closeFormDialog = () => {
    setIsDialogOpen(false);
    setEditingTransaction(null);
    setFormInitialData(null);
  };

  const openNewForm = () => {
    setEditingTransaction(null);
    setFormInitialData(null);
    setIsDialogOpen(true);
  };

  const handleFormSubmit = (data) => {
    if (editingTransaction) updateMutation.mutate({ id: editingTransaction.id, data });
    else createMutation.mutate(data);
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
      setEditingTransaction(pendingEditTransaction);
      setFormInitialData(null);
      setIsDialogOpen(true);
      setPendingEditTransaction(null);
      toast.success("Acesso autorizado!");
    } else {
      toast.error("Senha incorreta!");
    }
  };

  const initiateDelete = (transaction) => {
    setPendingDeleteTransaction(transaction);
    setIsDeleteAuthOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDeleteTransaction) deleteMutation.mutate(pendingDeleteTransaction.id);
  };

  const handleReceivePay = (transaction) => {
    setSelectedTransaction(transaction);
    setIsReceivePayOpen(true);
  };

  const handleViewPayments = (transaction) => {
    setViewingPayments(transaction);
    setIsPaymentHistoryOpen(true);
  };

  const handleReadReceipt = async () => {
    if (!receiptFile) { toast.error("Selecione uma imagem ou PDF do comprovante"); return; }
    setIsReadingReceipt(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: receiptFile });
      const extractionSchema = {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "number" },
          date: { type: "string", format: "date" },
          supplier_name: { type: "string" },
          category_suggestion: { type: "string" }
        },
        required: ["amount", "description"]
      };
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: extractionSchema });

      if (result.status === 'success' && result.output) {
        const data = result.output;
        let contactId = "";
        if (data.supplier_name) {
          const existingContact = contacts.find(c =>
            c.name.toLowerCase().includes(data.supplier_name.toLowerCase()) ||
            data.supplier_name.toLowerCase().includes(c.name.toLowerCase())
          );
          if (existingContact) contactId = existingContact.id;
        }
        setFormInitialData({
          description: data.description || "Despesa importada",
          amount: data.amount || 0,
          original_amount: data.amount || 0,
          discount_type: "valor",
          discount_value: 0,
          type: "despesa",
          category: data.category_suggestion || "",
          status: "pago",
          due_date: data.date || getTodayDate(),
          payment_date: data.date || getTodayDate(),
          account_id: "",
          contact_id: contactId,
          cost_center: "",
          notes: `Importado de comprovante: ${data.supplier_name || 'Desconhecido'}`
        });
        setEditingTransaction(null);
        setIsUploadDialogOpen(false);
        setIsDialogOpen(true);
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
    if (!importFile) { toast.error("Selecione um arquivo CSV"); return; }
    if (!importAccountId) { toast.error("Selecione uma conta para os lançamentos pagos"); return; }
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        let successCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          if (values.length < 2) continue;
          const row = {};
          headers.forEach((header, index) => { row[header] = values[index]; });
          const description = row['descricao'] || row['descrição'] || 'Importado via CSV';
          const amount = parseFloat((row['valor'] || '0').replace('R$', '').replace('.', '').replace(',', '.'));
          const validAmount = isNaN(amount) ? 0 : amount;
          const type = importType;
          const category = row['categoria'] || 'Geral';
          const dueDate = row['vencimento'] || row['data'] || getTodayDate();
          await base44.entities.Transaction.create({
            description, amount: validAmount, original_amount: validAmount,
            discount_type: "valor", discount_value: 0, type, category,
            status: 'pago', paid_amount: validAmount, due_date: dueDate, payment_date: dueDate,
            account_id: importAccountId, company_id: selectedCompanyId,
            notes: `Importado em ${formatDate(getTodayDate())} (Pago)`
          });
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

  // Derivações memoizadas: não recalculam a cada tecla digitada em formulários/filtros
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (dateFilter !== 'all') {
        const today = new Date();
        const dateToCheck = t.status === 'pago' && t.payment_date ? parseISO(t.payment_date) : parseISO(t.due_date);
        if (dateFilter === 'today' && !isSameDay(dateToCheck, today)) return false;
        if (dateFilter === 'week' && !isSameWeek(dateToCheck, today)) return false;
        if (dateFilter === 'month' && !isSameMonth(dateToCheck, today)) return false;
        if (dateFilter === 'custom' && customDates.start && customDates.end) {
          const start = startOfDay(parseISO(customDates.start));
          const end = endOfDay(parseISO(customDates.end));
          if (!isWithinInterval(dateToCheck, { start, end })) return false;
        }
      }
      if (debouncedSearch) {
        const search = debouncedSearch.toLowerCase();
        const matchDescription = t.description?.toLowerCase().includes(search);
        const matchContact = t.contact_name?.toLowerCase().includes(search);
        const matchCategory = t.category?.toLowerCase().includes(search);
        const matchNotes = t.notes?.toLowerCase().includes(search);
        if (!matchDescription && !matchContact && !matchCategory && !matchNotes) return false;
      }
      return true;
    });
  }, [transactions, filterStatus, filterType, dateFilter, customDates, debouncedSearch]);

  const kpis = useMemo(() => {
    let totalReceita = 0, totalDespesa = 0, pendingReceivables = 0, pendingPayables = 0;
    for (const t of transactions) {
      if (t.type === 'receita' && t.status === 'pago') totalReceita += (t.paid_amount || 0);
      else if (t.type === 'despesa' && t.status === 'pago') totalDespesa += (t.paid_amount || 0);
      if (t.type === 'receita' && t.status !== 'pago') pendingReceivables += (t.amount - (t.paid_amount || 0));
      else if (t.type === 'despesa' && t.status !== 'pago') pendingPayables += (t.amount - (t.paid_amount || 0));
    }
    return { totalReceita, totalDespesa, pendingReceivables, pendingPayables, saldoLiquido: totalReceita - totalDespesa };
  }, [transactions]);

  const dailyAverages = useMemo(() => {
    if (filteredTransactions.length === 0) return { receita: 0, despesa: 0, days: 0 };
    const dates = filteredTransactions.map(t => t.payment_date || t.due_date).filter(Boolean).map(d => new Date(d).getTime());
    if (dates.length === 0) return { receita: 0, despesa: 0, days: 0 };
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const diffDays = Math.max(1, Math.ceil(Math.abs(maxDate - minDate) / (1000 * 60 * 60 * 24)));
    const totalRev = filteredTransactions.filter(t => t.type === 'receita').reduce((s, t) => s + (t.paid_amount || t.amount), 0);
    const totalExp = filteredTransactions.filter(t => t.type === 'despesa').reduce((s, t) => s + (t.paid_amount || t.amount), 0);
    return { receita: totalRev / diffDays, despesa: totalExp / diffDays, days: diffDays };
  }, [filteredTransactions]);

  const dailyCashFlow = useMemo(() => {
    const grouped = {};
    filteredTransactions.forEach(t => {
      if (t.status === 'pago' && t.payment_date) {
        const date = t.payment_date;
        if (!grouped[date]) grouped[date] = { date, receita: 0, despesa: 0 };
        if (t.type === 'receita') grouped[date].receita += (t.paid_amount || 0);
        else grouped[date].despesa += (t.paid_amount || 0);
      }
    });
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)).map(item => ({ ...item, formattedDate: formatDate(item.date).slice(0, 5) }));
  }, [filteredTransactions]);

  const statusColors = {
    pendente: "bg-yellow-100 text-yellow-800",
    pago: "bg-green-100 text-green-800",
    atrasado: "bg-red-100 text-red-800",
    parcial: "bg-orange-100 text-orange-800"
  };

  const hasActiveFilters = searchTerm || filterType !== 'all' || filterStatus !== 'all' || dateFilter !== 'all';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Lançamentos Financeiros</h1>
          <p className="text-slate-500 mt-1">Entradas e saídas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <Button variant="outline" className="gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200" onClick={() => setIsUploadDialogOpen(true)}>
              <ScanLine className="w-4 h-4" /> Ler Comprovante
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-blue-600" /> Ler Comprovante com IA</DialogTitle>
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
                  <Input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files[0])} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsUploadDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleReadReceipt} disabled={isReadingReceipt || !receiptFile} className="bg-blue-600 hover:bg-blue-700">
                    {isReadingReceipt ? <><ScanLine className="w-4 h-4 mr-2 animate-pulse" />Lendo...</> : <><ScanLine className="w-4 h-4 mr-2" />Processar</>}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" onClick={() => setIsQuickEntryOpen(true)}>
            <Zap className="w-4 h-4" /> Lançamento Rápido
          </Button>

          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <Button variant="outline" className="gap-2" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="w-4 h-4" /> Importar
            </Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Importar Lançamentos (CSV)</DialogTitle></DialogHeader>
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Entrada</SelectItem>
                        <SelectItem value="despesa">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Conta (Pago)</Label>
                    <Select value={importAccountId} onValueChange={setImportAccountId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>{account.name} ({formatBRL(account.current_balance)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Arquivo CSV</Label>
                  <Input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files[0])} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsImportDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleImportFile} disabled={isImporting || !importFile}>{isImporting ? 'Importando...' : 'Processar Importação'}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={openNewForm}><Plus className="w-4 h-4 mr-2" /> Novo Lançamento</Button>
        </div>
      </div>

      {/* Diálogos de formulário isolados: digitar re-renderiza só o formulário */}
      <TransactionFormDialog
        open={isDialogOpen}
        onOpenChange={(o) => { if (!o) closeFormDialog(); else setIsDialogOpen(o); }}
        editingTransaction={editingTransaction}
        initialData={formInitialData}
        accounts={accounts}
        contacts={contacts}
        transactions={transactions}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
      <QuickEntryDialog
        open={isQuickEntryOpen}
        onOpenChange={setIsQuickEntryOpen}
        accounts={accounts}
        onSubmit={(data) => quickEntryMutation.mutate(data)}
        isSubmitting={quickEntryMutation.isPending}
      />
      <ReceivePayDialog
        open={isReceivePayOpen}
        onOpenChange={setIsReceivePayOpen}
        transaction={selectedTransaction}
        accounts={accounts}
        onSubmit={(paymentData) => registerPaymentMutation.mutate(paymentData)}
        isSubmitting={registerPaymentMutation.isPending}
      />

      {/* Senha para Exclusão */}
      <DeleteAuthDialog
        open={isDeleteAuthOpen}
        onClose={() => { setIsDeleteAuthOpen(false); setPendingDeleteTransaction(null); }}
        onSuccess={confirmDelete}
        itemType="lançamento"
      />

      {/* Senha para Edição */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Autorização Necessária</DialogTitle></DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Senha de Administrador</Label>
              <Input type="password" placeholder="Digite a senha..." value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsPasswordDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">Confirmar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Histórico de Pagamentos */}
      <Dialog open={isPaymentHistoryOpen} onOpenChange={setIsPaymentHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>📋 Histórico de Abatimentos</DialogTitle></DialogHeader>
          {viewingPayments && (
            <div className="space-y-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <h3 className="font-bold text-lg mb-2">{viewingPayments.description}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-slate-600">Valor Total:</span><p className="font-bold text-lg">{formatBRL(viewingPayments.amount)}</p></div>
                    <div><span className="text-slate-600">Status:</span><div className="mt-1"><Badge className={statusColors[viewingPayments.status]}>{viewingPayments.status}</Badge></div></div>
                    <div><span className="text-slate-600">Total Pago:</span><p className="font-bold text-green-600">{formatBRL(viewingPayments.paid_amount || 0)}</p></div>
                    <div><span className="text-slate-600">Descontos:</span><p className="font-bold text-red-500">{formatBRL(viewingPayments.discount || 0)}</p></div>
                  </div>
                </CardContent>
              </Card>
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Movimentações (Abatimentos)</h4>
                {paymentHistory.length > 0 ? (
                  <div className="space-y-2">
                    {paymentHistory.map((payment, idx) => (
                      <Card key={payment.id} className="bg-white">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">#{paymentHistory.length - idx}</Badge>
                                <span className="text-sm font-medium">{formatDate(payment.payment_date)}</span>
                              </div>
                              <p className="text-xs text-slate-600">{payment.account_name} • {payment.payment_method}</p>
                              {payment.notes && <p className="text-xs text-slate-500 mt-1">{payment.notes}</p>}
                              {payment.responsible && <p className="text-xs text-slate-400 mt-1">Por: {payment.responsible}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-600 text-lg">{formatBRL(payment.amount)}</p>
                              {(payment.discount > 0) && <p className="text-xs text-red-500">Desc: {formatBRL(payment.discount)}</p>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500"><History className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum abatimento registrado ainda</p></div>
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
            <CardTitle className="text-sm font-medium text-green-100">Entradas</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(kpis.totalReceita)}</div>
            <p className="text-xs text-green-200 mt-1">Recebido</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-100">Saídas</CardTitle>
            <TrendingDown className="h-5 w-5 text-red-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(kpis.totalDespesa)}</div>
            <p className="text-xs text-red-200 mt-1">Pago</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Líquido</CardTitle>
            <DollarSign className={`h-5 w-5 ${kpis.saldoLiquido >= 0 ? 'text-green-500' : 'text-red-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.saldoLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatBRL(kpis.saldoLiquido)}</div>
            <p className="text-xs text-slate-400 mt-1">Entradas - Saídas</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">A Receber</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatBRL(kpis.pendingReceivables)}</div></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">A Pagar</CardTitle>
            <AlertCircle className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatBRL(kpis.pendingPayables)}</div></CardContent>
        </Card>
      </div>

      {/* Gráfico e Médias */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Movimentação de Caixa Diária</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyCashFlow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="formattedDate" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatBRL(value)} contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Legend />
                  <Bar dataKey="receita" name="Entrada" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Saída" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Médias Diárias (Filtrado)</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
              <div><p className="text-sm text-green-900 font-medium">Entrada Média</p><p className="text-xs text-green-600">Base: {dailyAverages.days} dias</p></div>
              <span className="text-lg font-bold text-green-700">{formatBRL(dailyAverages.receita)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
              <div><p className="text-sm text-red-900 font-medium">Saída Média</p><p className="text-xs text-red-600">Base: {dailyAverages.days} dias</p></div>
              <span className="text-lg font-bold text-red-700">{formatBRL(dailyAverages.despesa)}</span>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-slate-500 mb-2 text-center">Saldo Diário Médio</p>
              <div className={`text-2xl font-bold text-center ${dailyAverages.receita - dailyAverages.despesa >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{formatBRL(dailyAverages.receita - dailyAverages.despesa)}</div>
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
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="receita">Entradas</SelectItem>
                <SelectItem value="despesa">Saídas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                <Input type="date" value={customDates.start} onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))} className="w-auto" />
                <span className="text-slate-400">até</span>
                <Input type="date" value={customDates.end} onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))} className="w-auto" />
              </div>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" onClick={() => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all'); setDateFilter('all'); }} className="ml-auto text-slate-500 hover:text-red-600">Limpar Filtros</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Transações */}
      <Card>
        <CardHeader><CardTitle>Lançamentos</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onEdit={initiateEdit}
                onDelete={initiateDelete}
                onReceivePay={handleReceivePay}
                onViewPayments={handleViewPayments}
              />
            ))}
            {filteredTransactions.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <BadgeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum lançamento encontrado</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}