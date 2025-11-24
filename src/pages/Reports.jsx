import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Package, TruckIcon, DollarSign, ShoppingCart, Fuel, Scale, Users, AlertTriangle, FileText, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Reports() {
  const [selectedCompanyId] = React.useState(localStorage.getItem('selectedCompanyId'));
  const [period, setPeriod] = useState("30");

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: stockEntries = [] } = useQuery({
    queryKey: ['stockEntries', selectedCompanyId],
    queryFn: () => base44.entities.StockEntry.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.list('-created_date', 100),
    initialData: []
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: refuelings = [] } = useQuery({
    queryKey: ['refuelings', selectedCompanyId],
    queryFn: () => base44.entities.Refueling.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: weighings = [] } = useQuery({
    queryKey: ['weighings', selectedCompanyId],
    queryFn: () => base44.entities.Weighing.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true }),
    initialData: []
  });

  // Cálculos Gerais
  const totalStockValue = stockEntries.reduce((sum, e) => sum + (e.quantity_available * e.unit_cost || 0), 0);
  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalRevenues = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.amount, 0);
  const totalFuelCost = refuelings.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock && p.min_stock > 0);

  // Dados para Fluxo de Caixa (Realizado - Baseado em data de pagamento)
  const cashFlowData = useMemo(() => {
    const days = parseInt(period);
    const data = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dateLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      const dayTransactions = transactions.filter(t => 
        t.status === 'pago' && 
        t.payment_date && 
        t.payment_date.startsWith(dateStr)
      );

      const income = dayTransactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.paid_amount, 0);
      const expense = dayTransactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.paid_amount, 0);

      data.push({
        name: dateLabel,
        receita: income,
        despesa: expense,
        saldo: income - expense
      });
    }
    return data;
  }, [transactions, period]);

  // Dados para DRE (Demonstração do Resultado do Exercício)
  const dreData = useMemo(() => {
    const incomeByCategory = {};
    const expenseByCategory = {};
    
    // Filtrar transações do período (simplificado para tudo o que está pago por enquanto, ou poderia filtrar por data)
    // Vamos usar todas as pagas para um "DRE Acumulado"
    const paidTransactions = transactions.filter(t => t.status === 'pago');

    paidTransactions.forEach(t => {
      const cat = t.category || 'Sem Categoria';
      if (t.type === 'receita') {
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + t.paid_amount;
      } else {
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + t.paid_amount;
      }
    });

    const totalReceitaOperacional = Object.values(incomeByCategory).reduce((a, b) => a + b, 0);
    const totalDespesas = Object.values(expenseByCategory).reduce((a, b) => a + b, 0);
    
    return {
      incomes: Object.entries(incomeByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      expenses: Object.entries(expenseByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      totalReceita: totalReceitaOperacional,
      totalDespesa: totalDespesas,
      resultado: totalReceitaOperacional - totalDespesas
    };
  }, [transactions]);

  // Vendas por mês (últimos 6 meses)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - i));
    return {
      month: date.toLocaleDateString('pt-BR', { month: 'short' }),
      value: 0
    };
  });

  sales.forEach(sale => {
    const saleDate = new Date(sale.sale_date);
    const monthDiff = (new Date().getFullYear() - saleDate.getFullYear()) * 12 + new Date().getMonth() - saleDate.getMonth();
    if (monthDiff >= 0 && monthDiff < 6) {
      last6Months[5 - monthDiff].value += sale.total || 0;
    }
  });

  // Distribuição de veículos por tipo
  const vehiclesByType = vehicles.reduce((acc, v) => {
    const type = v.fleet_type || 'propria';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const vehicleData = [
    { name: 'Própria', value: vehiclesByType.propria || 0 },
    { name: 'Agregada', value: vehiclesByType.agregada || 0 }
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Relatórios Gerenciais</h1>
          <p className="text-slate-500 mt-1">Análises e dashboards completos</p>
        </div>
        <div className="flex gap-2">
          {/* Future: Export Buttons */}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="financial">Financeiro & DRE</TabsTrigger>
          <TabsTrigger value="operational">Operacional</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* KPIs Principais */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Total Produtos</CardTitle>
                <Package className="h-5 w-5 text-blue-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{products.length}</div>
                <p className="text-xs text-blue-200 mt-1">ativos no sistema</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-green-100">Valor em Estoque</CardTitle>
                <DollarSign className="h-5 w-5 text-green-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-green-200 mt-1">valor total inventário</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-purple-100">Total Vendas</CardTitle>
                <ShoppingCart className="h-5 w-5 text-purple-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-purple-200 mt-1">{sales.length} pedidos</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-orange-100">Alertas</CardTitle>
                <AlertTriangle className="h-5 w-5 text-orange-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{lowStockProducts.length}</div>
                <p className="text-xs text-orange-200 mt-1">produtos com estoque baixo</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Vendas (Últimos 6 Meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={last6Months}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                    <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Frota</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={vehicleData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {vehicleData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Análise Financeira</h2>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fluxo de Caixa */}
          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Caixa Diário</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}
                    formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                  />
                  <Legend />
                  <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* DRE Simplificado */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>DRE - Receitas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dreData.incomes.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-slate-50">
                      <TableCell>TOTAL RECEITAS</TableCell>
                      <TableCell className="text-right text-green-700">
                        {dreData.totalReceita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>DRE - Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dreData.expenses.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-slate-50">
                      <TableCell>TOTAL DESPESAS</TableCell>
                      <TableCell className="text-right text-red-700">
                        {dreData.totalDespesa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className={`${dreData.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-slate-700">Resultado do Exercício (Lucro/Prejuízo)</span>
                <span className={`text-3xl font-bold ${dreData.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {dreData.resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operational" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                <TruckIcon className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vehicles.length}</div>
                <p className="text-xs text-slate-500">na frota</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Transferências</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{transfers.length}</div>
                <p className="text-xs text-slate-500">entre filiais</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Combustível</CardTitle>
                <Fuel className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  R$ {totalFuelCost.toFixed(2)}
                </div>
                <p className="text-xs text-slate-500">custo total</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Clientes</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{contacts.length}</div>
                <p className="text-xs text-slate-500">cadastrados</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}