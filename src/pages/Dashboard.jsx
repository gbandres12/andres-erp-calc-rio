import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Warehouse, TruckIcon, DollarSign, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Calendar } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDate } from "@/components/utils/formatters";

export default function Dashboard() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const navigate = useNavigate();

  // Redirecionar operador para Pesagem
  useEffect(() => {
    base44.auth.me().then(user => {
      if (user.custom_role === 'operator') {
        navigate(createPageUrl('Weighing'));
      }
    });
  }, [navigate]);

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

  // NOVO: Buscar transações pagas dos últimos 30 dias para o gráfico de fluxo de caixa
  const { data: allPaidTransactions = [] } = useQuery({
    queryKey: ['allPaidTransactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ 
      company_id: selectedCompanyId,
      status: 'pago'
    }, '-payment_date', 1000),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // NOVO: Buscar transações pendentes/atrasadas/parciais para os cards de A Receber/A Pagar
  const { data: pendingTransactions = [] } = useQuery({
    queryKey: ['pendingTransactions', selectedCompanyId],
    queryFn: async () => {
      const [pendente, parcial, atrasado] = await Promise.all([
        base44.entities.Transaction.filter({ company_id: selectedCompanyId, status: 'pendente' }, '-due_date', 500),
        base44.entities.Transaction.filter({ company_id: selectedCompanyId, status: 'parcial' }, '-due_date', 500),
        base44.entities.Transaction.filter({ company_id: selectedCompanyId, status: 'atrasado' }, '-due_date', 500)
      ]);
      return [...pendente, ...parcial, ...atrasado];
    },
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // NOVO: Processar dados para o gráfico de fluxo de caixa diário
  const dailyCashFlowData = useMemo(() => {
    const grouped = {};
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);
    
    // Inicializa os últimos 30 dias com zero
    for (let i = 0; i <= 30; i++) {
      const d = new Date(limitDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      grouped[dateStr] = { date: dateStr, receita: 0, despesa: 0 };
    }

    allPaidTransactions.forEach(t => {
      if (t.payment_date) {
        const tDate = new Date(t.payment_date);
        // Corrige fuso horário simplificado (pega só a parte da data YYYY-MM-DD)
        const dateStr = t.payment_date.split('T')[0]; 
        
        if (tDate >= limitDate && grouped[dateStr]) {
          if (t.type === 'receita') {
            grouped[dateStr].receita += (t.paid_amount || t.amount);
          } else {
            grouped[dateStr].despesa += (t.paid_amount || t.amount);
          }
        }
      }
    });

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
         ...item,
         formattedDate: formatDate(item.date).slice(0, 5) // DD/MM
      }));
  }, [allPaidTransactions]);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ 
      company_id: selectedCompanyId 
    }, '-sale_date', 100),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const salesChartData = useMemo(() => {
    const grouped = {};
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);
    
    // Inicializa os últimos 30 dias com zero
    for (let i = 0; i <= 30; i++) {
      const d = new Date(limitDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      grouped[dateStr] = { date: dateStr, total: 0 };
    }

    sales.forEach(sale => {
      if (sale.sale_date && sale.status !== 'cancelada') {
        const sDate = new Date(sale.sale_date);
        const dateStr = sale.sale_date.split('T')[0];
        
        if (sDate >= limitDate && grouped[dateStr]) {
          grouped[dateStr].total += (sale.total || 0);
        }
      }
    });

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
         ...item,
         formattedDate: formatDate(item.date).slice(0, 5) // DD/MM
      }));
  }, [sales]);

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
    const totalStockValueCost = stockEntries.reduce((sum, entry) => {
      const product = products.find(p => p.id === entry.product_id);
      const cost = entry.unit_cost > 0 ? entry.unit_cost : (product?.cost_price || 0);
      return sum + (entry.quantity_available * cost);
    }, 0);

    const totalPotentialSalesValue = stockEntries.reduce((sum, entry) => {
      const product = products.find(p => p.id === entry.product_id);
      const price = product?.sale_price || 0;
      return sum + (entry.quantity_available * price);
    }, 0);

    const lowStockProducts = products.filter(p => 
      p.current_stock <= p.min_stock && p.min_stock > 0
    );

    // Estoque específico por produto principal
    const calcStockForProduct = (keywords) => {
      const matchedProducts = products.filter(p =>
        keywords.some(kw => p.name?.toLowerCase().includes(kw.toLowerCase()))
      );
      const matchedIds = matchedProducts.map(p => p.id);
      const totalTons = stockEntries
        .filter(e => matchedIds.includes(e.product_id))
        .reduce((sum, e) => sum + (e.quantity_available || 0), 0);
      return { tons: totalTons, count: matchedProducts.length };
    };

    const britaStock = calcStockForProduct(["brita", "pedra", "calcário", "calcario"]);
    // Filtra apenas pó (excluindo brita/pedra)
    const poProducts = products.filter(p => {
      const name = p.name?.toLowerCase() || "";
      return (name.includes("pó") || name.includes("po") || name.includes("powder")) &&
             !name.includes("brita") && !name.includes("pedra");
    });
    const poIds = poProducts.map(p => p.id);
    const poTons = stockEntries
      .filter(e => poIds.includes(e.product_id))
      .reduce((sum, e) => sum + (e.quantity_available || 0), 0);

    const thisMonth = new Date().getMonth();
    const thisMonthRevenue = allPaidTransactions
      .filter(t => t.type === 'receita' && 
        new Date(t.payment_date).getMonth() === thisMonth)
      .reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);

    const thisMonthExpenses = allPaidTransactions
      .filter(t => t.type === 'despesa' && 
        new Date(t.payment_date).getMonth() === thisMonth)
      .reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);

    const pendingReceivables = pendingTransactions
      .filter(t => t.type === 'receita')
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

    const pendingPayables = pendingTransactions
      .filter(t => t.type === 'despesa')
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

    const clientsCount = contacts.filter(c => c.type === 'cliente' || c.type === 'ambos').length;
    const suppliersCount = contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').length;

    return {
      totalStockValueCost,
      totalPotentialSalesValue,
      lowStockProducts,
      thisMonthRevenue,
      thisMonthExpenses,
      pendingReceivables,
      pendingPayables,
      clientsCount,
      suppliersCount,
      britaStock,
      poTons,
    };
  }, [stockEntries, products, allPaidTransactions, contacts, pendingTransactions]);

  // Dados para gráfico de receitas vs despesas (últimos 6 meses)
  const financialChartData = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });
      const month = date.getMonth();
      const year = date.getFullYear();
      
      const receitas = allPaidTransactions
        .filter(t => t.type === 'receita' && t.payment_date)
        .filter(t => {
          const payDate = new Date(t.payment_date);
          return payDate.getMonth() === month && payDate.getFullYear() === year;
        })
        .reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);
      
      const despesas = allPaidTransactions
        .filter(t => t.type === 'despesa' && t.payment_date)
        .filter(t => {
          const payDate = new Date(t.payment_date);
          return payDate.getMonth() === month && payDate.getFullYear() === year;
        })
        .reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);
      
      months.push({
        name: monthName,
        receitas: receitas,
        despesas: despesas,
        lucro: receitas - despesas
      });
    }
    
    return months;
  }, [allPaidTransactions]);

  // Dados para gráfico de pizza de categorias de despesas
  const expensesCategoryData = useMemo(() => {
    const categories = {};
    allPaidTransactions
      .filter(t => t.type === 'despesa')
      .forEach(t => {
        const cat = t.category || 'Sem categoria';
        categories[cat] = (categories[cat] || 0) + (t.paid_amount || t.amount);
      });
    
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [allPaidTransactions]);

  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  const isLoading = loadingProducts || loadingStock || loadingVehicles || loadingTransactions || loadingSales;

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-stone-500 to-stone-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-stone-100">
                Pedra de Calcário (Brita)
              </CardTitle>
              <Package className="h-5 w-5 text-stone-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.britaStock.tons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-lg">TON</span></div>
              <p className="text-xs text-stone-200 mt-2">Estoque disponível em estoque</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-500 to-slate-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-100">
                Calcário em Pó
              </CardTitle>
              <Package className="h-5 w-5 text-slate-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.poTons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-lg">TON</span></div>
              <p className="text-xs text-slate-200 mt-2">Estoque disponível em estoque</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-emerald-100">
                Custo do Estoque
              </CardTitle>
              <Warehouse className="h-5 w-5 text-emerald-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                R$ {(stats.totalStockValueCost / 1000).toFixed(1)}k
              </div>
              <p className="text-xs text-emerald-200 mt-2">
                Baseado no custo de compra
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white border-none hover:shadow-xl transition-all duration-300 hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-purple-100">
                Potencial de Venda
              </CardTitle>
              <DollarSign className="h-5 w-5 text-purple-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                R$ {(stats.totalPotentialSalesValue / 1000).toFixed(1)}k
              </div>
              <p className="text-xs text-purple-200 mt-2">
                Baseado no preço de venda
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
          {/* Movimentação de Caixa Diária */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Movimentação de Caixa (30 dias)</CardTitle>
              <Link to={createPageUrl('FinancialAccounts')}>
                <Button variant="ghost" size="sm">
                  Ver detalhes <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyCashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="formattedDate" tick={{fontSize: 12}} />
                    <YAxis tick={{fontSize: 12}} />
                    <Tooltip 
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{fontSize: '12px'}} />
                    <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[4, 4, 0, 0]}>
                      <LabelList 
                        dataKey="receita" 
                        position="top" 
                        formatter={(value) => value > 0 ? value.toLocaleString('pt-BR', { notation: "compact", maximumFractionDigits: 1 }) : ""}
                        style={{ fontSize: '10px', fill: '#64748b' }} 
                      />
                    </Bar>
                    <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]}>
                      <LabelList 
                        dataKey="despesa" 
                        position="top" 
                        formatter={(value) => value > 0 ? value.toLocaleString('pt-BR', { notation: "compact", maximumFractionDigits: 1 }) : ""}
                        style={{ fontSize: '10px', fill: '#64748b' }} 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Evolução de Vendas */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Vendas (30 dias)</CardTitle>
              <Link to={createPageUrl('Sales')}>
                <Button variant="ghost" size="sm">
                  Ver todas <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="formattedDate" tick={{fontSize: 12}} />
                    <YAxis tick={{fontSize: 12}} />
                    <Tooltip 
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{fontSize: '12px'}} />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      name="Total Vendido" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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