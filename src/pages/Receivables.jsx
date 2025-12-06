import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, Plus, TrendingUp, Calendar, CheckCircle2, History, Upload, Mail, Bell, ArrowDownToLine, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatBRL, getTodayDate, formatDate } from "@/components/utils/formatters";

export default function Receivables() {
  const queryClient = useQueryClient();
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // UI States
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [viewingHistory, setViewingHistory] = useState(null);
  
  // Import States
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Sending Reminder State
  const [sendingReminder, setSendingReminder] = useState(null);

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_date: getTodayDate(),
    account_id: "",
    payment_method: "dinheiro",
    notes: ""
  });

  // Queries
  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ 
      company_id: selectedCompanyId,
      type: 'receita'
    }, '-due_date'),
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
  const receiveMutation = useMutation({
    mutationFn: async ({ id, amount, date, accountId, paymentMethod, notes }) => {
      const transaction = receivables.find(t => t.id === id);
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

      // Update Account Balance
      if (account) {
        await base44.entities.FinancialAccount.update(accountId, {
          current_balance: account.current_balance + amount
        });
      }
      
      return { newStatus, remaining };
    },
    onSuccess: ({ newStatus, remaining }) => {
      queryClient.invalidateQueries(['receivables']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      setIsReceiveOpen(false);
      setSelectedTransaction(null);
      setPaymentForm({
        amount: 0,
        payment_date: getTodayDate(),
        account_id: "",
        payment_method: "dinheiro",
        notes: ""
      });
      toast.success(newStatus === 'pago' ? "Recebimento concluído!" : `Recebimento parcial registrado. Restante: ${formatBRL(remaining)}`);
    },
    onError: (err) => toast.error("Erro ao registrar recebimento: " + err.message)
  });

  // Send Reminder
  const handleSendReminder = async (transaction) => {
    if (!transaction.contact_id) {
      toast.error("Esta conta não tem cliente vinculado.");
      return;
    }
    
    setSendingReminder(transaction.id);
    try {
      const res = await base44.functions.invoke('sendPaymentReminder', { transactionId: transaction.id });
      // Note: backend function returns Response object, SDK handles parsing if using correct method, 
      // but here we invoke directly. base44.functions.invoke returns the response data directly or the response object depending on SDK version.
      // Assuming it returns the parsed JSON or we handle it. 
      // If using standard SDK: returns { data, status } usually.
      
      if (res?.error) throw new Error(res.error);
      toast.success("Lembrete enviado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar lembrete.");
    } finally {
      setSendingReminder(null);
    }
  };

  // Import Logic
  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        let count = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          if (values.length < 2) continue;

          const row = {};
          headers.forEach((h, idx) => row[h] = values[idx]);

          const description = row['descricao'] || row['descrição'] || 'Importado';
          const amount = parseFloat((row['valor'] || '0').replace('R$', '').replace('.', '').replace(',', '.'));
          const dueDate = row['vencimento'] || row['data'] || getTodayDate();
          const category = row['categoria'] || 'Vendas';

          if (amount > 0) {
             await base44.entities.Transaction.create({
                description,
                amount,
                type: 'receita',
                category,
                status: 'pendente',
                paid_amount: 0,
                due_date: dueDate,
                company_id: selectedCompanyId,
                notes: 'Importado via CSV (A Receber)'
             });
             count++;
          }
        }
        
        queryClient.invalidateQueries(['receivables']);
        setIsImportOpen(false);
        setImportFile(null);
        toast.success(`${count} contas a receber importadas!`);
      } catch (err) {
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
    return "bg-yellow-100 text-yellow-800"; // Pendente
  };

  const getStatusLabel = (status, dueDate) => {
    if (status === 'pago') return "Pago";
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDate);
    due.setHours(0,0,0,0);
    
    if (due < today) return "Vencido";
    if (due.getTime() === today.getTime()) return "Vence Hoje";
    return "Pendente";
  };

  // Filtered Data
  const filteredReceivables = useMemo(() => {
    return receivables.filter(t => {
      // Status Filter
      if (statusFilter !== 'all') {
        const statusLabel = getStatusLabel(t.status, t.due_date).toLowerCase();
        if (statusFilter === 'vencido' && statusLabel !== 'vencido') return false;
        if (statusFilter === 'pendente' && !['pendente', 'vence hoje'].includes(statusLabel)) return false;
        if (statusFilter === 'pago' && t.status !== 'pago') return false;
      }

      // Client Filter
      if (clientFilter !== 'all' && t.contact_id !== clientFilter) return false;

      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return t.description.toLowerCase().includes(term) || 
               t.contact_name?.toLowerCase().includes(term) ||
               t.category?.toLowerCase().includes(term);
      }

      return true;
    });
  }, [receivables, statusFilter, clientFilter, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: filteredReceivables.reduce((acc, t) => acc + t.amount, 0),
      received: filteredReceivables.reduce((acc, t) => acc + (t.paid_amount || 0), 0),
      pending: filteredReceivables.reduce((acc, t) => acc + (t.amount - (t.paid_amount || 0)), 0)
    };
  }, [filteredReceivables]);

  const openReceiveDialog = (t) => {
    setSelectedTransaction(t);
    setPaymentForm({
      amount: t.amount - (t.paid_amount || 0),
      payment_date: getTodayDate(),
      account_id: "",
      payment_method: "dinheiro",
      notes: ""
    });
    setIsReceiveOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contas a Receber</h1>
          <p className="text-slate-500">Gerenciamento de recebimentos e cobranças</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" /> Importar Pendentes
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar Contas a Receber</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
                  CSV: descricao, valor, vencimento, categoria
                </p>
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
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total a Receber</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatBRL(stats.total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Já Recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatBRL(stats.received)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Pendente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatBRL(stats.pending)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input 
              placeholder="Pesquisar..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="vencido">Vencidos</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
            </SelectContent>
          </Select>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-[220px] justify-between">
                 {clientFilter === 'all' ? "Todos Clientes" : contacts.find(c => c.id === clientFilter)?.name || "Cliente"}
                 <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0">
              <Command>
                <CommandInput placeholder="Buscar cliente..." />
                <CommandList>
                  <CommandEmpty>Nenhum cliente.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={() => setClientFilter('all')}>Todos Clientes</CommandItem>
                    {contacts.filter(c => c.type === 'cliente' || c.type === 'ambos').map(contact => (
                      <CommandItem key={contact.id} onSelect={() => setClientFilter(contact.id)}>
                        {contact.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {filteredReceivables.map(t => {
           const statusLabel = getStatusLabel(t.status, t.due_date);
           const statusClass = getStatusColor(t.status, t.due_date);
           const remaining = t.amount - (t.paid_amount || 0);

           return (
             <Card key={t.id} className="hover:shadow-md transition-shadow">
               <CardContent className="p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                 <div className="flex items-center gap-4 flex-1">
                   <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", 
                     t.status === 'pago' ? "bg-green-100" : "bg-blue-100"
                   )}>
                     <TrendingUp className={cn("w-5 h-5", t.status === 'pago' ? "text-green-600" : "text-blue-600")} />
                   </div>
                   <div>
                     <h3 className="font-medium">{t.description}</h3>
                     <div className="flex gap-2 text-sm text-slate-500 items-center">
                        <span className="font-medium text-slate-700">{t.contact_name || "Cliente não identificado"}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(t.due_date)}</span>
                     </div>
                     <Badge className={cn("mt-2", statusClass)} variant="outline">{statusLabel}</Badge>
                   </div>
                 </div>

                 <div className="flex items-center gap-6">
                   <div className="text-right">
                     <p className="font-bold text-lg">{formatBRL(t.amount)}</p>
                     {remaining > 0 && remaining < t.amount && (
                       <p className="text-xs text-orange-600 font-medium">Restante: {formatBRL(remaining)}</p>
                     )}
                   </div>
                   
                   <div className="flex gap-2">
                     {remaining > 0 && (
                       <>
                         <Button size="sm" onClick={() => openReceiveDialog(t)} className="bg-green-600 hover:bg-green-700">
                           <DollarSign className="w-4 h-4 mr-1" /> Receber
                         </Button>
                         <Button 
                           size="sm" 
                           variant="outline"
                           onClick={() => handleSendReminder(t)}
                           disabled={sendingReminder === t.id}
                         >
                           {sendingReminder === t.id ? (
                             <span className="animate-pulse">Enviando...</span>
                           ) : (
                             <><Bell className="w-4 h-4 mr-1" /> Lembrar</>
                           )}
                         </Button>
                       </>
                     )}
                     {(t.paid_amount > 0) && (
                        <Button size="sm" variant="ghost" onClick={() => { setViewingHistory(t); setIsHistoryOpen(true); }}>
                          <History className="w-4 h-4" />
                        </Button>
                     )}
                   </div>
                 </div>
               </CardContent>
             </Card>
           );
        })}
        {filteredReceivables.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Nenhuma conta encontrada</p>
          </div>
        )}
      </div>

      {/* Dialog Receber */}
      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label>Valor Recebido</Label>
               <Input 
                 type="number" 
                 value={paymentForm.amount} 
                 onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})}
               />
             </div>
             <div className="space-y-2">
               <Label>Data</Label>
               <Input 
                 type="date" 
                 value={paymentForm.payment_date} 
                 onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})}
               />
             </div>
             <div className="space-y-2">
               <Label>Conta de Destino</Label>
               <Select value={paymentForm.account_id} onValueChange={v => setPaymentForm({...paymentForm, account_id: v})}>
                 <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                 <SelectContent>
                   {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
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
             <Button className="w-full" onClick={() => receiveMutation.mutate({ ...paymentForm, id: selectedTransaction.id })} disabled={receiveMutation.isPending}>
               {receiveMutation.isPending ? 'Processando...' : 'Confirmar Recebimento'}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Histórico */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Histórico de Recebimentos</DialogTitle></DialogHeader>
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
    </div>
  );
}