import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, TrendingDown, Calendar, CheckCircle2, History, Upload, ChevronsUpDown, ArrowUpFromLine, AlertCircle, BarChart3, Filter, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, getTodayDate, formatDate } from "@/components/utils/formatters";
import { EXPENSE_CATEGORIES } from "@/components/utils/categories";
import { subDays, isBefore, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export default function Payables() {
  const queryClient = useQueryClient();
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  
  // Filters
  const [tabFilter, setTabFilter] = useState('pending'); // Default to pending (A Pagar)
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, week, month, very_overdue
  const [searchTerm, setSearchTerm] = useState('');

  // UI States
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [addForm, setAddForm] = useState({
    description: "",
    amount: 0,
    category: "",
    due_date: getTodayDate(),
    contact_id: "",
    notes: ""
  });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [viewingHistory, setViewingHistory] = useState(null);
  
  // Import States
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_date: getTodayDate(),
    account_id: "",
    payment_method: "dinheiro",
    notes: ""
  });

  // Edit & Delete States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPayable, setEditingPayable] = useState(null);
  const [editForm, setEditForm] = useState({
    description: "",
    amount: 0,
    category: "",
    due_date: getTodayDate(),
    contact_id: "",
    notes: ""
  });

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [payableToDelete, setPayableToDelete] = useState(null);

  // Queries
  const { data: payables = [] } = useQuery({
    queryKey: ['payables', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ 
      company_id: selectedCompanyId,
      type: 'despesa'
    }, 'due_date'), // Sort by due date ascending (closest first)
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
    queryKey: ['payment-history', viewingHistory?.id],
    queryFn: () => {
      if (!viewingHistory?.id) return [];
      return base44.entities.TransactionPayment.filter({ 
        transaction_id: viewingHistory.id
      }, '-payment_date');
    },
    enabled: !!viewingHistory?.id,
    initialData: []
  });

  // Mutations
  const payMutation = useMutation({
    mutationFn: async ({ id, amount, date, accountId, paymentMethod, notes }) => {
      const transaction = payables.find(t => t.id === id);
      if (!transaction) throw new Error("Transação não encontrada");

      const currentPaid = transaction.paid_amount || 0;
      let newPaid = currentPaid + amount;
      if (newPaid > transaction.amount) newPaid = transaction.amount;

      const remaining = transaction.amount - newPaid;
      let newStatus = remaining <= 0.005 ? 'pago' : 'parcial';

      // Update Transaction
      await base44.entities.Transaction.update(id, {
        paid_amount: newPaid,
        status: newStatus,
        payment_date: newStatus === 'pago' ? date : transaction.payment_date,
        account_id: accountId || transaction.account_id
      });

      // Create Payment Record
      const account = accounts.find(a => a.id === accountId);
      const user = await base44.auth.me();

      await base44.entities.TransactionPayment.create({
        transaction_id: id,
        transaction_reference: transaction.description,
        amount: amount,
        payment_date: date,
        account_id: accountId,
        account_name: account?.name || '',
        payment_method: paymentMethod,
        responsible: user?.full_name || user?.email,
        notes: notes,
        company_id: selectedCompanyId
      });

      // Update Account Balance (Decrease)
      if (account) {
        await base44.entities.FinancialAccount.update(accountId, {
          current_balance: account.current_balance - amount
        });
      }
      
      return { newStatus, remaining };
    },
    onSuccess: ({ newStatus, remaining }) => {
      queryClient.invalidateQueries(['payables']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      setIsPayOpen(false);
      setSelectedTransaction(null);
      setPaymentForm({
        amount: 0,
        payment_date: getTodayDate(),
        account_id: "",
        payment_method: "dinheiro",
        notes: ""
      });
      toast.success(newStatus === 'pago' ? "Pagamento concluído!" : `Pagamento parcial registrado. Restante: ${formatBRL(remaining)}`);
    },
    onError: (err) => toast.error("Erro ao registrar pagamento: " + err.message)
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
       await base44.entities.Transaction.create({
          ...data,
          type: 'despesa',
          status: 'pendente',
          paid_amount: 0,
          company_id: selectedCompanyId
       });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['payables']);
      setIsAddOpen(false);
      setAddForm({
        description: "",
        amount: 0,
        category: "",
        due_date: getTodayDate(),
        contact_id: "",
        notes: ""
      });
      toast.success("Conta a pagar adicionada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao adicionar conta: " + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.Transaction.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['payables']);
      setIsEditOpen(false);
      setEditingPayable(null);
      toast.success("Conta atualizada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao atualizar conta: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Transaction.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['payables']);
      setIsDeleteOpen(false);
      setPayableToDelete(null);
      toast.success("Conta removida com sucesso!");
    },
    onError: (err) => toast.error("Erro ao remover conta: " + err.message)
  });

  const handleEdit = (payable) => {
    setEditingPayable(payable);
    setEditForm({
      description: payable.description,
      amount: payable.amount,
      category: payable.category || "",
      due_date: payable.due_date,
      contact_id: payable.contact_id || "",
      notes: payable.notes || ""
    });
    setIsEditOpen(true);
  };

  const handleDelete = (payable) => {
    setPayableToDelete(payable);
    setIsDeleteOpen(true);
  };

  // Import Logic
  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        // Divide linhas lidando com diferentes quebras de linha
        const lines = text.split(/\r?\n/);
        
        if (lines.length < 2) {
           throw new Error("Arquivo vazio ou sem cabeçalho");
        }

        // Detectar separador (vírgula ou ponto e vírgula)
        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        
        const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        let count = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
          if (values.length < 2) continue;

          const row = {};
          headers.forEach((h, idx) => {
             if (idx < values.length) row[h] = values[idx];
          });

          const description = row['descricao'] || row['descrição'] || row['description'] || 'Importado';
          
          // Tratamento robusto de valores numéricos (1.000,00 ou 1000.00)
          let valStr = (row['valor'] || row['amount'] || '0').replace('R$', '').trim();
          if (valStr.includes(',') && valStr.includes('.')) {
             // Assume formato brasileiro se o último for vírgula (ex: 1.000,00)
             if (valStr.lastIndexOf(',') > valStr.lastIndexOf('.')) {
                valStr = valStr.replace(/\./g, '').replace(',', '.');
             } else {
                valStr = valStr.replace(/,/g, '');
             }
          } else if (valStr.includes(',')) {
             valStr = valStr.replace(',', '.');
          }
          const amount = parseFloat(valStr);

          // Tratamento de data (DD/MM/YYYY para YYYY-MM-DD)
          let dueDate = row['vencimento'] || row['data'] || row['due_date'] || getTodayDate();
          if (dueDate.includes('/')) {
             const parts = dueDate.split('/');
             if (parts.length === 3) { // Assume DD/MM/YYYY
                dueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
             }
          }
          
          // Fallback para data válida se falhar
          if (isNaN(new Date(dueDate).getTime())) {
             dueDate = getTodayDate();
          }

          const category = row['categoria'] || row['category'] || 'Despesas';

          if (amount > 0) {
             await base44.entities.Transaction.create({
                description,
                amount,
                type: 'despesa',
                category,
                status: 'pendente',
                paid_amount: 0,
                due_date: dueDate,
                company_id: selectedCompanyId,
                notes: 'Importado via CSV (A Pagar)'
             });
             count++;
          }
        }
        
        queryClient.invalidateQueries(['payables']);
        setIsImportOpen(false);
        setImportFile(null);
        if (count > 0) {
           toast.success(`${count} contas importadas com sucesso!`);
        } else {
           toast.warning("Nenhuma conta válida encontrada no arquivo.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Erro na importação: " + err.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(importFile);
  };

  // Helper
  const getStatusColor = (status, dueDate) => {
    if (status === 'pago') return "bg-green-100 text-green-800";
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDate);
    due.setHours(0,0,0,0);
    
    if (due < today) return "bg-red-100 text-red-800"; // Vencido
    if (due.getTime() === today.getTime()) return "bg-orange-100 text-orange-800"; // Vence hoje
    return "bg-slate-100 text-slate-800"; // Pendente
  };

  const getStatusLabel = (status, dueDate) => {
    if (status === 'pago') return "Pago";
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDate);
    due.setHours(0,0,0,0);
    
    if (due < today) return "Vencido";
    if (due.getTime() === today.getTime()) return "Vence Hoje";
    return "A Vencer";
  };

  const isOverdue = (dueDate) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDate);
    due.setHours(0,0,0,0);
    return due < today;
  };

  // Filtered Data
  const filteredPayables = useMemo(() => {
    return payables.filter(t => {
      const statusLabel = getStatusLabel(t.status, t.due_date).toLowerCase();
      const overdue = isOverdue(t.due_date) && t.status !== 'pago';
      const dueDate = parseISO(t.due_date);
      const today = new Date();

      // Date Filters
      if (dateFilter === 'week') {
        const start = startOfWeek(today);
        const end = endOfWeek(today);
        if (!isWithinInterval(dueDate, { start, end }) && t.status !== 'pago') return false;
      }
      if (dateFilter === 'month') {
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        if (!isWithinInterval(dueDate, { start, end }) && t.status !== 'pago') return false;
      }
      if (dateFilter === 'very_overdue') {
        const limit = subDays(today, 30);
        if (!(isBefore(dueDate, limit) && t.status !== 'pago')) return false;
      }

      // Tab Filters
      if (tabFilter === 'pending' && t.status === 'pago') return false; // Hide paid in pending tab
      if (tabFilter === 'overdue' && !overdue) return false;
      if (tabFilter === 'paid' && t.status !== 'pago') return false;

      // Supplier Filter
      if (supplierFilter !== 'all' && t.contact_id !== supplierFilter) return false;

      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return t.description.toLowerCase().includes(term) || 
               t.contact_name?.toLowerCase().includes(term) ||
               t.category?.toLowerCase().includes(term);
      }

      return true;
    });
  }, [payables, tabFilter, supplierFilter, searchTerm, dateFilter]);

  // Analysis Data
  const categoryData = useMemo(() => {
    const data = {};
    payables.filter(t => t.status === 'pago').forEach(t => {
      const cat = t.category || 'Outros';
      data[cat] = (data[cat] || 0) + t.amount;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [payables]);

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];

  // Stats
  const stats = useMemo(() => {
    const allPending = payables.filter(t => t.status !== 'pago');
    const allOverdue = allPending.filter(t => isOverdue(t.due_date));
    
    return {
      totalPending: allPending.reduce((acc, t) => acc + (t.amount - (t.paid_amount || 0)), 0),
      totalOverdue: allOverdue.reduce((acc, t) => acc + (t.amount - (t.paid_amount || 0)), 0),
      countOverdue: allOverdue.length
    };
  }, [payables]);

  const openPayDialog = (t) => {
    setSelectedTransaction(t);
    setPaymentForm({
      amount: t.amount - (t.paid_amount || 0),
      payment_date: getTodayDate(),
      account_id: "",
      payment_method: "dinheiro",
      notes: ""
    });
    setIsPayOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contas a Pagar</h1>
          <p className="text-slate-500">Gestão de despesas e pagamentos a fornecedores</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsAddOpen(true)} className="bg-red-600 hover:bg-red-700 gap-2">
            <Plus className="w-4 h-4" /> Nova Conta
          </Button>
          <Button variant="outline" onClick={() => setIsAnalysisOpen(true)} className="gap-2">
            <BarChart3 className="w-4 h-4" /> Relatórios
          </Button>
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" /> Importar Contas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar Contas a Pagar</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                  <p className="font-semibold mb-1">Formato CSV Aceito:</p>
                  <p>descricao, valor, vencimento, categoria</p>
                  <p className="text-xs text-slate-500 mt-1">Aceita separador vírgula (,) ou ponto-e-vírgula (;)</p>
                  <p className="text-xs text-slate-500">Datas: DD/MM/AAAA ou AAAA-MM-DD</p>
                </div>
                <Input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} />
                <Button onClick={handleImport} disabled={!importFile || isImporting} className="w-full">
                  {isImporting ? 'Processando...' : 'Importar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total a Pagar (Pendente)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatBRL(stats.totalPending)}</div>
          </CardContent>
        </Card>
        <Card className={stats.countOverdue > 0 ? "border-red-200 bg-red-50" : ""}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-red-600">Total Atrasado</CardTitle>
              {stats.countOverdue > 0 && <AlertCircle className="w-4 h-4 text-red-600" />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatBRL(stats.totalOverdue)}</div>
            <p className="text-xs text-red-500 mt-1">{stats.countOverdue} contas vencidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-2">
          <Tabs value={tabFilter} onValueChange={setTabFilter} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="pending">A Vencer</TabsTrigger>
              <TabsTrigger value="overdue" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-700">Atrasadas</TabsTrigger>
              <TabsTrigger value="paid">Pagas</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap mb-6 mt-4">
            <div className="flex-1 min-w-[200px]">
              <Input 
                placeholder="Pesquisar por descrição ou fornecedor..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o Período</SelectItem>
                <SelectItem value="week">Vence esta Semana</SelectItem>
                <SelectItem value="month">Vence este Mês</SelectItem>
                <SelectItem value="very_overdue" className="text-red-600 font-medium">Muito Atrasadas (+30 dias)</SelectItem>
              </SelectContent>
            </Select>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[220px] justify-between">
                   {supplierFilter === 'all' ? "Todos Fornecedores" : contacts.find(c => c.id === supplierFilter)?.name || "Fornecedor"}
                   <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder="Buscar fornecedor..." />
                  <CommandList>
                    <CommandEmpty>Nenhum fornecedor.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => setSupplierFilter('all')}>Todos Fornecedores</CommandItem>
                      {contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').map(contact => (
                        <CommandItem key={contact.id} onSelect={() => setSupplierFilter(contact.id)}>
                          {contact.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-4">
            {filteredPayables.map(t => {
               const statusLabel = getStatusLabel(t.status, t.due_date);
               const statusClass = getStatusColor(t.status, t.due_date);
               const remaining = t.amount - (t.paid_amount || 0);

               const isVeryOverdue = !t.payment_date && isBefore(parseISO(t.due_date), subDays(new Date(), 30));

               return (
                 <div key={t.id} className={cn(
                   "flex flex-col md:flex-row justify-between items-center gap-4 p-4 border rounded-lg transition-colors",
                   isVeryOverdue ? "bg-red-50 border-red-100" : "hover:bg-slate-50"
                 )}>
                   <div className="flex items-center gap-4 flex-1 w-full">
                     <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", 
                       t.status === 'pago' ? "bg-green-100" : "bg-red-100"
                     )}>
                       <TrendingDown className={cn("w-5 h-5", t.status === 'pago' ? "text-green-600" : "text-red-600")} />
                     </div>
                     <div className="min-w-0">
                       <h3 className="font-medium truncate">{t.description}</h3>
                       <div className="flex gap-2 text-sm text-slate-500 items-center flex-wrap">
                          <span className="font-medium text-slate-700">{t.contact_name || "Fornecedor não iden."}</span>
                          <span className="hidden md:inline">•</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(t.due_date)}</span>
                       </div>
                       <div className="flex gap-2 mt-2">
                         <Badge className={cn(statusClass)} variant="outline">{statusLabel}</Badge>
                         {isVeryOverdue && <Badge variant="destructive" className="bg-red-600">Crítico: +30 dias</Badge>}
                       </div>
                     </div>
                   </div>

                   <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                     <div className="text-right">
                       <p className="font-bold text-lg">{formatBRL(t.amount)}</p>
                       {remaining > 0 && remaining < t.amount && (
                         <p className="text-xs text-orange-600 font-medium">Restante: {formatBRL(remaining)}</p>
                       )}
                     </div>
                     
                     <div className="flex gap-2">
                       {remaining > 0 && (
                          <Button size="sm" onClick={() => openPayDialog(t)} className="bg-red-600 hover:bg-red-700">
                            <DollarSign className="w-4 h-4 mr-1" /> Pagar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(t)}>
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(t)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                        {(t.paid_amount > 0) && (
                           <Button size="sm" variant="ghost" onClick={() => { setViewingHistory(t); setIsHistoryOpen(true); }}>
                             <History className="w-4 h-4" />
                           </Button>
                        )}
                       </div>
                   </div>
                 </div>
               );
            })}
            {filteredPayables.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Nenhuma conta encontrada</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Pagar */}
      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label>Valor Pago</Label>
               <Input 
                 type="number" 
                 value={paymentForm.amount} 
                 onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})}
               />
             </div>
             <div className="space-y-2">
               <Label>Data do Pagamento</Label>
               <Input 
                 type="date" 
                 value={paymentForm.payment_date} 
                 onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})}
               />
             </div>
             <div className="space-y-2">
               <Label>Conta de Saída</Label>
               <Select value={paymentForm.account_id} onValueChange={v => setPaymentForm({...paymentForm, account_id: v})}>
                 <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                 <SelectContent>
                   {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({formatBRL(a.current_balance)})</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <Label>Forma de Pagamento</Label>
               <Select value={paymentForm.payment_method} onValueChange={v => setPaymentForm({...paymentForm, payment_method: v})}>
                 <SelectTrigger><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="dinheiro">Dinheiro</SelectItem>
                   <SelectItem value="pix">PIX</SelectItem>
                   <SelectItem value="boleto">Boleto</SelectItem>
                   <SelectItem value="transferencia">Transferência</SelectItem>
                   <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                   <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => payMutation.mutate({ ...paymentForm, id: selectedTransaction.id })} disabled={payMutation.isPending}>
               {payMutation.isPending ? 'Processando...' : 'Confirmar Pagamento'}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Histórico */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Histórico de Pagamentos</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {paymentHistory.length === 0 ? (
               <p className="text-center text-slate-500">Nenhum histórico disponível.</p>
            ) : (
              paymentHistory.map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded border">
                  <div>
                    <p className="font-medium">{formatBRL(p.amount)}</p>
                    <p className="text-xs text-slate-500">{formatDate(p.payment_date)} • {p.payment_method}</p>
                  </div>
                  <Badge variant="outline">#{paymentHistory.length - i}</Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Conta */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input 
                value={addForm.description} 
                onChange={e => setAddForm({...addForm, description: e.target.value})}
                placeholder="Ex: Aluguel, Fornecedor X..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={addForm.amount} 
                  onChange={e => setAddForm({...addForm, amount: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input 
                  type="date" 
                  value={addForm.due_date} 
                  onChange={e => setAddForm({...addForm, due_date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={addForm.category} onValueChange={v => setAddForm({...addForm, category: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fornecedor (Opcional)</Label>
              <Select value={addForm.contact_id} onValueChange={v => setAddForm({...addForm, contact_id: v === 'none' ? '' : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input 
                value={addForm.notes} 
                onChange={e => setAddForm({...addForm, notes: e.target.value})}
              />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => createMutation.mutate(addForm)} disabled={createMutation.isPending || !addForm.description || addForm.amount <= 0}>
              {createMutation.isPending ? 'Salvando...' : 'Adicionar Conta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Conta */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Conta</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input 
                value={editForm.description} 
                onChange={e => setEditForm({...editForm, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={editForm.amount} 
                  onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input 
                  type="date" 
                  value={editForm.due_date} 
                  onChange={e => setEditForm({...editForm, due_date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fornecedor (Opcional)</Label>
              <Select value={editForm.contact_id} onValueChange={v => setEditForm({...editForm, contact_id: v === 'none' ? '' : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input 
                value={editForm.notes} 
                onChange={e => setEditForm({...editForm, notes: e.target.value})}
              />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => updateMutation.mutate({ id: editingPayable.id, data: editForm })} disabled={updateMutation.isPending || !editForm.description || editForm.amount <= 0}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Excluir Conta */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Conta</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 mb-4">Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.</p>
            {payableToDelete && (
              <div className="bg-red-50 p-3 rounded border border-red-100 mb-4">
                <p className="font-medium text-red-800">{payableToDelete.description}</p>
                <p className="text-sm text-red-600">{formatBRL(payableToDelete.amount)} - {formatDate(payableToDelete.due_date)}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancelar</Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteMutation.mutate(payableToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir Definitivamente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Análise */}
      <Dialog open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Análise de Despesas</DialogTitle></DialogHeader>
          <div className="py-4">
             <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-0 shadow-none">
                  <CardHeader><CardTitle className="text-base">Por Categoria (Pago)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatBRL(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-700 mb-4">Top Gastos</h4>
                  {categoryData.map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-sm font-medium">{cat.name}</span>
                      </div>
                      <span className="font-bold text-slate-700">{formatBRL(cat.value)}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}