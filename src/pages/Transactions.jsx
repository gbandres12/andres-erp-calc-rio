
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
import { DollarSign, Plus, TrendingUp, TrendingDown, Calendar, AlertCircle, History, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/components/utils/formatters";

export default function Transactions() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState(''); // NOVO: campo de pesquisa

  const [viewingPayments, setViewingPayments] = useState(null);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [isReceivePayOpen, setIsReceivePayOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [paymentFormData, setPaymentFormData] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    account_id: "",
    payment_method: "dinheiro",
    notes: ""
  });

  const [formData, setFormData] = useState({
    description: "",
    amount: 0,
    type: "receita",
    category: "",
    status: "pendente",
    due_date: new Date().toISOString().split('T')[0],
    payment_date: "",
    account_id: "",
    contact_id: "",
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
    mutationFn: (data) => base44.entities.Transaction.create({
      ...data,
      company_id: selectedCompanyId,
      paid_amount: data.status === 'pago' ? data.amount : 0
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['transactions']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Lançamento criado com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['transactions']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Lançamento atualizado!");
    }
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async ({ id, amount, date, accountId, paymentMethod, notes }) => {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) throw new Error("Transação não encontrada");

      const currentPaidAmount = transaction.paid_amount || 0;
      let newPaidAmount = currentPaidAmount + amount;

      if (newPaidAmount > transaction.amount) {
        newPaidAmount = transaction.amount;
      }

      const remainingAmount = transaction.amount - newPaidAmount;

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
        payment_date: date,
        account_id: accountId,
        account_name: account?.name || '',
        payment_method: paymentMethod || 'dinheiro',
        responsible: user?.full_name || user?.email || '',
        notes: notes || '',
        company_id: selectedCompanyId
      });

      if (accountId && account) {
        const adjustment = transaction.type === 'receita' ? amount : -amount;
        await base44.entities.FinancialAccount.update(accountId, {
          current_balance: account.current_balance + adjustment
        });
      }

      return { transaction, newStatus, newPaidAmount, remainingAmount };
    },
    onSuccess: ({ newStatus, remainingAmount }) => {
      queryClient.invalidateQueries(['transactions']);
      queryClient.invalidateQueries(['accounts']);
      queryClient.invalidateQueries(['payment-history']);
      setIsReceivePayOpen(false);
      setSelectedTransaction(null);
      setPaymentFormData({
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
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
      type: "receita",
      category: "",
      status: "pendente",
      due_date: new Date().toISOString().split('T')[0],
      payment_date: "",
      account_id: "",
      contact_id: "",
      notes: ""
    });
    setEditingTransaction(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      description: transaction.description || "",
      amount: transaction.amount || 0,
      type: transaction.type || "receita",
      category: transaction.category || "",
      status: transaction.status || "pendente",
      due_date: transaction.due_date || new Date().toISOString().split('T')[0],
      payment_date: transaction.payment_date || "",
      account_id: transaction.account_id || "",
      contact_id: transaction.contact_id || "",
      notes: transaction.notes || ""
    });
    setIsDialogOpen(true);
  };

  const handleReceivePay = (transaction) => {
    setSelectedTransaction(transaction);
    setPaymentFormData({
      amount: transaction.amount - (transaction.paid_amount || 0),
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
      amount: paymentFormData.amount,
      date: paymentFormData.payment_date,
      accountId: paymentFormData.account_id,
      paymentMethod: paymentFormData.payment_method,
      notes: paymentFormData.notes
    });
  };

  // ATUALIZAR: Adicionar pesquisa ao filtro
  const filteredTransactions = transactions.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    
    // Pesquisa por descrição ou contato
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchDescription = t.description?.toLowerCase().includes(search);
      const matchContact = t.contact_name?.toLowerCase().includes(search);
      const matchCategory = t.category?.toLowerCase().includes(search);
      if (!matchDescription && !matchContact && !matchCategory) return false;
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

  const statusColors = {
    pendente: "bg-yellow-100 text-yellow-800",
    pago: "bg-green-100 text-green-800",
    atrasado: "bg-red-100 text-red-800",
    parcial: "bg-orange-100 text-orange-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Lançamentos Financeiros</h1>
          <p className="text-slate-500 mt-1">Receitas e despesas</p>
        </div>
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
                    <div className="space-y-2">
                      <Label>Valor *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição *</Label>
                    <Input
                      required
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Input
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contato</Label>
                      <Select
                        value={formData.contact_id}
                        onValueChange={(value) => setFormData({ ...formData, contact_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
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
                  </div>

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
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-slate-600 font-medium">Saldo Restante:</span>
                      <span className="text-orange-600 font-bold text-lg">
                        {formatBRL(selectedTransaction.amount - (selectedTransaction.paid_amount || 0))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Valor a {selectedTransaction.type === 'receita' ? 'Receber' : 'Pagar'} *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={paymentFormData.amount}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: parseFloat(e.target.value) || 0 })}
                    max={selectedTransaction.amount - (selectedTransaction.paid_amount || 0)}
                  />
                  <p className="text-xs text-slate-500">
                    Máximo: {formatBRL(selectedTransaction.amount - (selectedTransaction.paid_amount || 0))}
                  </p>
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
                      <span className="text-slate-600">Saldo Restante:</span>
                      <p className="font-bold text-orange-600">
                        {formatBRL(viewingPayments.amount - (viewingPayments.paid_amount || 0))}
                      </p>
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
                                  {new Date(payment.payment_date).toLocaleDateString('pt-BR')}
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
              const remainingAmount = transaction.amount - (transaction.paid_amount || 0);
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
                          Venc: {new Date(transaction.due_date).toLocaleDateString('pt-BR')}
                        </p>
                        {dateStatus && (
                          <Badge variant="outline" className={`text-xs ${dateStatus.color} border-current`}>
                            {dateStatus.text}
                          </Badge>
                        )}
                        {transaction.payment_date && transaction.status === 'pago' && (
                          <Badge variant="outline" className="text-xs text-green-600 bg-green-50 border-green-200">
                            Pago em: {new Date(transaction.payment_date).toLocaleDateString('pt-BR')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
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
