import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Warehouse, TruckIcon, DollarSign, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Calendar } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Dashboard() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: stockEntries = [], isLoading: loadingStock } = useQuery({
    queryKey: ['stockEntries', selectedCompanyId],
    queryFn: () => base44.entities.StockEntry.filter({ 
      company_id: selectedCompanyId,
      status: 'ativo'
    }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ 
      company_id: selectedCompanyId,
      status: 'ativo'
    }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ 
      company_id: selectedCompanyId
    }, '-created_date', 10),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.filter({ 
      status: 'enviado'
    }, '-created_date', 5),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', selectedCompanyId],
    queryFn: () => base44.entities.Contact.filter({ 
      company_id: selectedCompanyId,
      is_active: true 
    }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const totalStockValue = stockEntries.reduce((sum, entry) => 
      sum + (entry.quantity_available * entry.unit_cost || 0), 0
    );

    const lowStockProducts = products.filter(p => 
      p.current_stock <= p.min_stock && p.min_stock > 0
    );

    const thisMonth = new Date().getMonth();
    const thisMonthRevenue = transactions
      .filter(t => t.type === 'receita' && t.status === 'pago' && 
        new Date(t.payment_date).getMonth() === thisMonth)
      .reduce((sum, t) => sum + t.amount, 0);

    const thisMonthExpenses = transactions
      .filter(t => t.type === 'despesa' && t.status === 'pago' && 
        new Date(t.payment_date).getMonth() === thisMonth)
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingReceivables = transactions
      .filter(t => t.type === 'receita' && t.status === 'pendente')
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingPayables = transactions
      .filter(t => t.type === 'despesa' && t.status === 'pendente')
      .reduce((sum, t) => sum + t.amount, 0);

    const clientsCount = contacts.filter(c => c.type === 'cliente' || c.type === 'ambos').length;
    const suppliersCount = contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').length;

    return {
      totalStockValue,
      lowStockProducts,
      thisMonthRevenue,
      thisMonthExpenses,
      pendingReceivables,
      pendingPayables,
      clientsCount,
      suppliersCount
    };
  }, [stockEntries, products, transactions, contacts]);

  // Dados para gráfico de receitas vs despesas (últimos 6 meses)
  const financialChartData = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });
      const month = date.getMonth();
      const year = date.getFullYear();
      
      const receitas = transactions
        .filter(t => t.type === 'receita' && t.status === 'pago' && t.payment_date)
        .filter(t => {
          const payDate = new Date(t.payment_date);
          return payDate.getMonth() === month && payDate.getFullYear() === year;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      
      const despesas = transactions
        .filter(t => t.type === 'despesa' && t.status === 'pago' && t.payment_date)
        .filter(t => {
          const payDate = new Date(t.payment_date);
          return payDate.getMonth() === month && payDate.getFullYear() === year;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      
      months.push({
        name: monthName,
        receitas: receitas,
        despesas: despesas,
        lucro: receitas - despesas
      });
    }
    
    return months;
  }, [transactions]);

  // Dados para gráfico de pizza de categorias de despesas
  const expensesCategoryData = useMemo(() => {
    const categories = {};
    transactions
      .filter(t => t.type === 'despesa' && t.status === 'pago')
      .forEach(t => {
        const cat = t.category || 'Sem categoria';
        categories[cat] = (categories[cat] || 0) + t.amount;
      });
    
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  const isLoading = loadingProducts || loadingStock || loadingVehicles || loadingTransactions;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 rounded w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-32 bg-slate-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Visão geral e indicadores do sistema</p>
        </div>

        {/* Cards Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-violet-500 to-violet-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-violet-100">
                Produtos Cadastrados
              </CardTitle>
              <Package className="h-5 w-5 text-violet-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{products.length}</div>
              <p className="text-xs text-violet-200 mt-2">Total de itens ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-emerald-100">
                Valor em Estoque
              </CardTitle>
              <Warehouse className="h-5 w-5 text-emerald-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                R$ {(stats.totalStockValue / 1000).toFixed(1)}k
              </div>
              <p className="text-xs text-emerald-200 mt-2">
                {stockEntries.length} entradas registradas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500 to-cyan-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-cyan-100">
                Frota de Veículos
              </CardTitle>
              <TruckIcon className="h-5 w-5 text-cyan-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{vehicles.length}</div>
              <p className="text-xs text-cyan-200 mt-2">Veículos ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-amber-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-amber-100">
                Alertas de Estoque
              </CardTitle>
              <AlertTriangle className="h-5 w-5 text-amber-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.lowStockProducts.length}</div>
              <p className="text-xs text-amber-200 mt-2">Produtos abaixo do mínimo</p>
            </CardContent>
          </Card>
        </div>

        {/* Cards Financeiros */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                Receitas do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                R$ {stats.thisMonthRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                Despesas do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                R$ {stats.thisMonthExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                A Receber
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                R$ {stats.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-orange-600" />
                A Pagar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                R$ {stats.pendingPayables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Gráfico de Receitas x Despesas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Receitas vs Despesas (Últimos 6 Meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financialChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" fill="#10b981" name="Receitas" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="despesas" fill="#ef4444" name="Despesas" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Pizza - Categorias de Despesas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 Categorias de Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              {expensesCategoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expensesCategoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {expensesCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-500">
                  Nenhuma despesa registrada
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Listas */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Produtos com Estoque Baixo */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Produtos com Estoque Baixo</CardTitle>
              <Link to={createPageUrl('Products')}>
                <Button variant="ghost" size="sm">
                  Ver todos <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {stats.lowStockProducts.length > 0 ? (
                <div className="space-y-3">
                  {stats.lowStockProducts.slice(0, 5).map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div>
                        <p className="font-medium text-slate-900">{product.name}</p>
                        <p className="text-sm text-slate-500">{product.code}</p>
                      </div>
                      <Badge variant="destructive">
                        {product.current_stock} / {product.min_stock}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Todos os produtos estão com estoque adequado</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transferências Pendentes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Transferências Pendentes</CardTitle>
              <Link to={createPageUrl('Transfers')}>
                <Button variant="ghost" size="sm">
                  Ver todas <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {transfers.length > 0 ? (
                <div className="space-y-3">
                  {transfers.map((transfer) => (
                    <div key={transfer.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{transfer.product_name}</p>
                        <p className="text-sm text-slate-500">
                          {transfer.origin_name} → {transfer.destination_name}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {transfer.quantity} {transfer.unit}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma transferência pendente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Últimas Transações */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Últimas Transações</CardTitle>
            <Link to={createPageUrl('Transactions')}>
              <Button variant="ghost" size="sm">
                Ver todas <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        transaction.type === 'receita' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        <DollarSign className={`w-5 h-5 ${
                          transaction.type === 'receita' ? 'text-green-600' : 'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{transaction.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={transaction.status === 'pago' ? 'default' : 'outline'} className="text-xs">
                            {transaction.status}
                          </Badge>
                          {transaction.due_date && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(transaction.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${
                        transaction.type === 'receita' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'receita' ? '+' : '-'} R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      {transaction.contact_name && (
                        <p className="text-xs text-slate-500">{transaction.contact_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma transação registrada</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}