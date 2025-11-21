
import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, Plus, Building, Wallet, Smartphone, TrendingUp, Edit, Trash2, FileText, TrendingDown, CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/components/utils/formatters";

export default function FinancialAccounts() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [viewingAccount, setViewingAccount] = useState(null);
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState(null); // NOVO: data inicial do filtro
  const [endDate, setEndDate] = useState(null); // NOVO: data final do filtro
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [formData, setFormData] = useState({
    name: "",
    type: "banco",
    bank_name: "",
    account_number: "",
    initial_balance: 0,
    current_balance: 0
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ 
      company_id: selectedCompanyId,
      is_active: true
    }),
    initialData: []
  });

  // ATUALIZAR: Buscar transações da conta selecionada com filtro de data
  const { data: accountTransactions = [] } = useQuery({
    queryKey: ['account-transactions', viewingAccount?.id, startDate, endDate],
    queryFn: () => {
      if (!viewingAccount?.id) return [];
      return base44.entities.Transaction.filter({ 
        account_id: viewingAccount.id,
        status: 'pago'
      }, '-payment_date');
    },
    enabled: !!viewingAccount?.id,
    initialData: []
  });

  // NOVO: Filtrar transações por data
  const filteredTransactions = useMemo(() => {
    if (!startDate && !endDate) return accountTransactions;

    return accountTransactions.filter(transaction => {
      if (!transaction.payment_date) return false;

      const paymentDate = new Date(transaction.payment_date);
      paymentDate.setHours(0, 0, 0, 0);

      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return paymentDate >= start && paymentDate <= end;
      }

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        return paymentDate >= start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return paymentDate <= end;
      }

      return true;
    });
  }, [accountTransactions, startDate, endDate]);

  // NOVO: Calcular totais do período filtrado
  const periodStats = useMemo(() => {
    const entradas = filteredTransactions
      .filter(t => t.type === 'receita')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const saidas = filteredTransactions
      .filter(t => t.type === 'despesa')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    return {
      entradas,
      saidas,
      saldo: entradas - saidas
    };
  }, [filteredTransactions]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FinancialAccount.create({
      ...data,
      company_id: selectedCompanyId,
      current_balance: data.initial_balance
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['accounts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Conta criada com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FinancialAccount.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['accounts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Conta atualizada com sucesso!");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FinancialAccount.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries(['accounts']);
      setDeletingAccount(null);
      toast.success("Conta excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir conta: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "banco",
      bank_name: "",
      account_number: "",
      initial_balance: 0,
      current_balance: 0
    });
    setEditingAccount(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name || "",
      type: account.type || "banco",
      bank_name: account.bank_name || "",
      account_number: account.account_number || "",
      initial_balance: account.initial_balance || 0,
      current_balance: account.current_balance || 0
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (account) => {
    setDeletingAccount(account);
  };

  const confirmDelete = () => {
    if (deletingAccount) {
      deleteMutation.mutate(deletingAccount.id);
    }
  };

  // ATUALIZAR: Abrir extrato da conta e resetar filtros
  const handleViewStatement = (account) => {
    setViewingAccount(account);
    setStartDate(null);
    setEndDate(null);
    setIsStatementDialogOpen(true);
  };

  // NOVO: Atalhos de período
  const setQuickPeriod = (period) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStartDate = null;
    let newEndDate = null;

    switch (period) {
      case 'hoje':
        newStartDate = today;
        newEndDate = today;
        break;
      case 'semana':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        newStartDate = startOfWeek;
        newEndDate = today;
        break;
      case 'mes':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        newStartDate = startOfMonth;
        newEndDate = today;
        break;
      case 'ano':
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        newStartDate = startOfYear;
        newEndDate = today;
        break;
      case 'tudo':
        newStartDate = null;
        newEndDate = null;
        break;
      default:
        break;
    }
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const typeIcons = {
    banco: Building,
    caixa: Wallet,
    carteira_digital: Smartphone
  };

  const typeLabels = {
    banco: "Banco",
    caixa: "Caixa",
    carteira_digital: "Carteira Digital"
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contas Financeiras</h1>
          <p className="text-slate-500 mt-1">Gestão de contas bancárias e caixa</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? "Editar Conta" : "Nova Conta"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Nome da Conta *</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Banco do Brasil - Conta Corrente"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banco">Banco</SelectItem>
                      <SelectItem value="caixa">Caixa</SelectItem>
                      <SelectItem value="carteira_digital">Carteira Digital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.type === 'banco' && (
                  <>
                    <div className="space-y-2">
                      <Label>Nome do Banco</Label>
                      <Input
                        value={formData.bank_name}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Número da Conta</Label>
                      <Input
                        value={formData.account_number}
                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Saldo Inicial (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                {editingAccount && (
                  <div className="space-y-2">
                    <Label>Saldo Atual (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.current_balance}
                      onChange={(e) => setFormData({ ...formData, current_balance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingAccount ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI - Saldo Total */}
      <Card className="mb-8 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
        <CardHeader>
          <CardTitle className="text-blue-100">Saldo Total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold mb-2">
            {formatBRL(totalBalance)}
          </div>
          <p className="text-blue-200">em {accounts.length} conta(s)</p>
        </CardContent>
      </Card>

      {/* Lista de Contas */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500 mb-4">Nenhuma conta cadastrada ainda</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar Primeira Conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((account) => {
            const Icon = typeIcons[account.type];
            return (
              <Card key={account.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{account.name}</CardTitle>
                        <Badge variant="secondary" className="mt-1">
                          {typeLabels[account.type]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {account.bank_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Banco:</span>
                        <span className="font-medium">{account.bank_name}</span>
                      </div>
                    )}
                    {account.account_number && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Conta:</span>
                        <span className="font-medium">{account.account_number}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Saldo Inicial:</span>
                      <span className="font-medium">
                        {formatBRL(account.initial_balance)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t">
                    <p className="text-sm text-slate-600 mb-1">Saldo Atual:</p>
                    <p className={`text-2xl font-bold ${
                      account.current_balance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatBRL(account.current_balance)}
                    </p>
                    {account.current_balance !== account.initial_balance && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>
                          {account.current_balance > account.initial_balance ? '+' : ''}
                          {formatBRL(account.current_balance - account.initial_balance)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleViewStatement(account)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Extrato
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(account)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(account)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ATUALIZAR: Dialog de Extrato da Conta */}
      <Dialog open={isStatementDialogOpen} onOpenChange={setIsStatementDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Extrato - {viewingAccount?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Resumo da Conta */}
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Saldo Inicial</p>
                    <p className="text-xl font-bold text-slate-900">
                      {formatBRL(viewingAccount?.initial_balance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Saldo Atual</p>
                    <p className={`text-xl font-bold ${
                      viewingAccount?.current_balance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatBRL(viewingAccount?.current_balance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Movimentação Total</p>
                    <p className={`text-xl font-bold ${
                      (viewingAccount?.current_balance - viewingAccount?.initial_balance) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatBRL(viewingAccount?.current_balance - viewingAccount?.initial_balance)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* NOVO: Filtros de Período */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-900">Filtrar por Período</h4>
                    {(startDate || endDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStartDate(null);
                          setEndDate(null);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Limpar Filtro
                      </Button>
                    )}
                  </div>

                  {/* Atalhos de Período */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={startDate && endDate && startDate.toDateString() === new Date().setHours(0,0,0,0).toDateString() && endDate.toDateString() === new Date().setHours(0,0,0,0).toDateString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuickPeriod('hoje')}
                    >
                      Hoje
                    </Button>
                    <Button
                      variant={startDate && endDate && startDate.toDateString() === new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).setHours(0,0,0,0).toDateString() && endDate.toDateString() === new Date().setHours(0,0,0,0).toDateString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuickPeriod('semana')}
                    >
                      Esta Semana
                    </Button>
                    <Button
                      variant={startDate && endDate && startDate.toDateString() === new Date(new Date().getFullYear(), new Date().getMonth(), 1).setHours(0,0,0,0).toDateString() && endDate.toDateString() === new Date().setHours(0,0,0,0).toDateString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuickPeriod('mes')}
                    >
                      Este Mês
                    </Button>
                    <Button
                      variant={startDate && endDate && startDate.toDateString() === new Date(new Date().getFullYear(), 0, 1).setHours(0,0,0,0).toDateString() && endDate.toDateString() === new Date().setHours(0,0,0,0).toDateString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuickPeriod('ano')}
                    >
                      Este Ano
                    </Button>
                    <Button
                      variant={!startDate && !endDate ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuickPeriod('tudo')}
                    >
                      Tudo
                    </Button>
                  </div>

                  {/* Seletores de Data */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data Inicial</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="w-4 h-4 mr-2" />
                            {startDate ? formatDate(startDate) : 'Selecionar data'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={setStartDate}
                            initialFocus
                            captionLayout="dropdown-buttons"
                            fromYear={2000}
                            toYear={new Date().getFullYear() + 1}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Data Final</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="w-4 h-4 mr-2" />
                            {endDate ? formatDate(endDate) : 'Selecionar data'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={setEndDate}
                            initialFocus
                            captionLayout="dropdown-buttons"
                            fromYear={2000}
                            toYear={new Date().getFullYear() + 1}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Estatísticas do Período Filtrado */}
                  {(startDate || endDate) && (
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Entradas no Período</p>
                        <p className="text-lg font-bold text-green-600">
                          {formatBRL(periodStats.entradas)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Saídas no Período</p>
                        <p className="text-lg font-bold text-red-600">
                          {formatBRL(periodStats.saidas)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Saldo do Período</p>
                        <p className={`text-lg font-bold ${
                          periodStats.saldo >= 0 ? 'text-blue-600' : 'text-orange-600'
                        }`}>
                          {formatBRL(periodStats.saldo)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Lista de Transações */}
            <div className="max-h-[300px] overflow-y-auto space-y-3">
              {filteredTransactions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">
                      {accountTransactions.length === 0 
                        ? 'Nenhuma movimentação registrada'
                        : 'Nenhuma movimentação encontrada no período selecionado.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex justify-between items-center px-2 text-sm text-slate-600">
                    <span>{filteredTransactions.length} transação(ões) encontrada(s)</span>
                  </div>
                  {filteredTransactions.map((transaction) => (
                    <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              transaction.type === 'receita' ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {transaction.type === 'receita' ? (
                                <TrendingUp className="w-5 h-5 text-green-600" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{transaction.description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {transaction.type === 'receita' ? 'Receita' : 'Despesa'}
                                </Badge>
                                {transaction.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {transaction.category}
                                  </Badge>
                                )}
                                <span className="text-xs text-slate-500">
                                  {formatDate(transaction.payment_date)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-xl font-bold ${
                              transaction.type === 'receita' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {transaction.type === 'receita' ? '+' : '-'} {formatBRL(transaction.amount)}
                            </p>
                            {transaction.contact_name && (
                              <p className="text-xs text-slate-500 mt-1">{transaction.contact_name}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!deletingAccount} onOpenChange={() => setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a conta <strong>{deletingAccount?.name}</strong>?
              <br /><br />
              <span className="text-red-600 font-semibold">⚠️ ATENÇÃO:</span> Esta ação não pode ser desfeita. 
              A conta será desativada e não aparecerá mais nas listas.
              {deletingAccount?.current_balance !== 0 && (
                <>
                  <br /><br />
                  <span className="text-orange-600 font-semibold">⚠️ SALDO ATUAL:</span> {formatBRL(deletingAccount?.current_balance)}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Sim, Excluir Conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
