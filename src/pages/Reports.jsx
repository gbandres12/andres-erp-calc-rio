import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Package, TruckIcon, DollarSign, ShoppingCart, Fuel, Scale, Users, AlertTriangle, FileText, Download, Calendar as CalendarIcon, Printer, ArrowUpCircle, ArrowDownCircle, Building2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDate, getTodayDate } from "@/components/utils/formatters";
import { toast } from "sonner";
import CostsDashboard from "@/components/reports/CostsDashboard";

export default function Reports() {
  const [selectedCompanyId] = React.useState(localStorage.getItem('selectedCompanyId'));
  const [filterCompanyId, setFilterCompanyId] = useState(localStorage.getItem('selectedCompanyId') || 'all');
  const [period, setPeriod] = useState("30");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90); // Default to 90 days for better trend analysis
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [endDate, setEndDate] = useState(getTodayDate());
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [generatingPDF, setGeneratingPDF] = useState(false);

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
    queryKey: ['transactions', filterCompanyId],
    queryFn: async () => {
      const filter = {};
      if (filterCompanyId !== 'all') {
        filter.company_id = filterCompanyId;
      }
      // Fetch more data for better historical analysis (e.g. 1 year back or based on date filter if possible)
      // Since filter API doesn't support complex date filtering easily here, we filter client-side
      return base44.entities.Transaction.filter(filter);
    },
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
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

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  // Funções de Exportação
  const handleExportCSV = (data, filename, columns) => {
    const csvContent = [
        columns.map(c => c.header).join(','),
        ...data.map(row => columns.map(c => `"${String(row[c.dataKey] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportPDF = async (reportType, title, data, columns, summary) => {
    try {
        setGeneratingPDF(true);
        const response = await base44.functions.invoke('exportReportPdf', {
            reportType,
            title,
            subtitle: `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`,
            data,
            columns,
            summary
        });

        if (response.data && response.data.file_data) {
            const link = document.createElement('a');
            link.href = response.data.file_data;
            link.download = `${title.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Relatório gerado com sucesso!");
        } else {
            throw new Error("Dados inválidos recebidos do servidor");
        }
    } catch (error) {
        console.error(error);
        toast.error("Erro ao gerar PDF: " + error.message);
    } finally {
        setGeneratingPDF(false);
    }
  };

  // Filtros de Data
  const filterByDate = (items, dateField) => {
    return items.filter(item => {
        if (!item[dateField]) return false;
        return item[dateField] >= startDate && item[dateField] <= endDate;
    });
  };

  // Cálculos Gerais
  const totalStockValue = stockEntries.reduce((sum, e) => sum + (e.quantity_available * e.unit_cost || 0), 0);
  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalRevenues = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.amount, 0);
  const totalFuelCost = refuelings.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock && p.min_stock > 0);

  // Dados para Fluxo de Caixa (Realizado)
  const cashFlowData = useMemo(() => {
    const data = [];
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) return [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const [y, m, day] = dateStr.split('-');
      const dateLabel = `${day}/${m}`;
      
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
  }, [transactions, startDate, endDate]);

  // Dados para DRE (Demonstração do Resultado do Exercício)
  const dreData = useMemo(() => {
    const incomeByCategory = {};
    const expenseByCategory = {};
    
    // Filtrar transações PAGAS no período selecionado
    const filteredTransactions = filterByDate(transactions, 'payment_date').filter(t => t.status === 'pago');

    filteredTransactions.forEach(t => {
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
  }, [transactions, startDate, endDate]);

  // Dados para Extrato Bancário
  const statementData = useMemo(() => {
    let filtered = filterByDate(transactions, 'payment_date').filter(t => t.status === 'pago');
    
    if (selectedAccount !== 'all') {
        filtered = filtered.filter(t => t.account_id === selectedAccount);
    }

    return filtered.sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date)).map(t => ({
        date: t.payment_date,
        description: t.description,
        category: t.category,
        type: t.type,
        value: t.type === 'receita' ? t.paid_amount : -t.paid_amount,
        account_name: accounts.find(a => a.id === t.account_id)?.name || 'N/A'
    }));
  }, [transactions, startDate, endDate, selectedAccount, accounts]);

  // Dados para Contas a Pagar/Receber
  const pendingData = useMemo(() => {
    // Filtra por data de VENCIMENTO
    const filtered = filterByDate(transactions, 'due_date').filter(t => t.status !== 'pago');
    
    const receivables = filtered.filter(t => t.type === 'receita');
    const payables = filtered.filter(t => t.type === 'despesa');

    return {
        receivables: receivables.sort((a, b) => new Date(a.due_date) - new Date(b.due_date)),
        payables: payables.sort((a, b) => new Date(a.due_date) - new Date(b.due_date)),
        totalReceivables: receivables.reduce((sum, t) => sum + (t.amount - (t.paid_amount||0)), 0),
        totalPayables: payables.reduce((sum, t) => sum + (t.amount - (t.paid_amount||0)), 0)
    };
  }, [transactions, startDate, endDate]);

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
      <div className="mb-8 space-y-4">
        <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Relatórios Gerenciais</h1>
              <p className="text-slate-500 mt-1">Análises e dashboards completos</p>
            </div>
        </div>
        
        {/* Global Date Filter */}
        <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4 flex items-end gap-4 flex-wrap">
                <div className="space-y-1">
                    <Label>Data Inicial</Label>
                    <Input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)} 
                        className="bg-white w-[160px]"
                    />
                </div>
                <div className="space-y-1">
                    <Label>Data Final</Label>
                    <Input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)} 
                        className="bg-white w-[160px]"
                    />
                </div>
                
                <div className="space-y-1">
                    <Label>Filial / Empresa</Label>
                    <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
                        <SelectTrigger className="w-[200px] bg-white">
                            <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">🏢 Todas as Filiais</SelectItem>
                            {companies.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="pb-1">
                    <Button variant="outline" onClick={() => {
                        setEndDate(getTodayDate());
                        const d = new Date();
                        d.setDate(d.getDate() - 30);
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        setStartDate(`${year}-${month}-${day}`);
                    }}>
                        Últimos 30 dias
                    </Button>
                </div>
            </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="costs">Análise de Custos</TabsTrigger>
          <TabsTrigger value="financial">DRE & Fluxo</TabsTrigger>
          <TabsTrigger value="statement">Extrato Bancário</TabsTrigger>
          <TabsTrigger value="payables">A Pagar/Receber</TabsTrigger>
          <TabsTrigger value="operational">Operacional</TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <CostsDashboard 
            transactions={filterByDate(transactions, 'due_date')} 
            companies={companies}
            startDate={startDate}
            endDate={endDate}
          />
        </TabsContent>

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
          {/* DRE Improved */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>DRE - Demonstração do Resultado</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">
                    Período: {formatDate(startDate)} a {formatDate(endDate)}
                  </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExportCSV(
                        [...dreData.incomes.map(i => ({...i, type: 'Receita'})), ...dreData.expenses.map(i => ({...i, type: 'Despesa'}))], 
                        'dre_dados', 
                        [{header: 'Tipo', dataKey: 'type'}, {header: 'Categoria', dataKey: 'name'}, {header: 'Valor', dataKey: 'value'}]
                    )}>
                        <FileText className="w-4 h-4 mr-2" /> CSV
                    </Button>
                    <Button size="sm" onClick={() => handleExportPDF(
                        'DRE', 
                        'Demonstração do Resultado do Exercício',
                        [
                            ...dreData.incomes.map(i => ({ categoria: i.name, valor: formatBRL(i.value), tipo: 'Receita' })),
                            ...dreData.expenses.map(i => ({ categoria: i.name, valor: formatBRL(i.value), tipo: 'Despesa' }))
                        ],
                        [
                            { header: 'Tipo', dataKey: 'tipo' },
                            { header: 'Categoria', dataKey: 'categoria' },
                            { header: 'Valor', dataKey: 'valor' }
                        ],
                        [
                            { label: 'Total Receitas', value: formatBRL(dreData.totalReceita) },
                            { label: 'Total Despesas', value: formatBRL(dreData.totalDespesa) },
                            { label: 'Resultado', value: formatBRL(dreData.resultado) }
                        ]
                    )} disabled={generatingPDF}>
                        <Printer className="w-4 h-4 mr-2" /> PDF
                    </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                    {/* ... existing DRE content logic adapted ... */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-green-700 flex items-center gap-2">
                            <ArrowUpCircle className="w-4 h-4" /> Receitas Operacionais
                        </h3>
                        <Table>
                            <TableBody>
                                {dreData.incomes.map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatBRL(item.value)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="font-bold bg-green-50">
                                    <TableCell>Total Receitas</TableCell>
                                    <TableCell className="text-right">{formatBRL(dreData.totalReceita)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-semibold text-red-700 flex items-center gap-2">
                            <ArrowDownCircle className="w-4 h-4" /> Despesas Operacionais
                        </h3>
                        <Table>
                            <TableBody>
                                {dreData.expenses.map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatBRL(item.value)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="font-bold bg-red-50">
                                    <TableCell>Total Despesas</TableCell>
                                    <TableCell className="text-right">{formatBRL(dreData.totalDespesa)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className={`mt-6 p-4 rounded-lg border ${dreData.resultado >= 0 ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'}`}>
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-bold">RESULTADO LÍQUIDO</span>
                        <span className={`text-2xl font-bold ${dreData.resultado >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                            {formatBRL(dreData.resultado)}
                        </span>
                    </div>
                </div>
            </CardContent>
          </Card>
          
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

          {/* Removed old DRE sections as they are now unified above */}
        </TabsContent>

        <TabsContent value="statement" className="space-y-6">
          <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <CardTitle>Extrato Bancário</CardTitle>
                        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="Selecione a Conta" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas as Contas</SelectItem>
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleExportCSV(
                            statementData, 'extrato_bancario', 
                            [
                                {header: 'Data', dataKey: 'date'}, 
                                {header: 'Descrição', dataKey: 'description'}, 
                                {header: 'Valor', dataKey: 'value'},
                                {header: 'Conta', dataKey: 'account_name'}
                            ]
                        )}>
                            <FileText className="w-4 h-4 mr-2" /> CSV
                        </Button>
                        <Button size="sm" onClick={() => handleExportPDF(
                            'Extrato',
                            `Extrato Bancário - ${selectedAccount === 'all' ? 'Consolidado' : accounts.find(a=>a.id===selectedAccount)?.name}`,
                            statementData.map(i => ({
                                date: formatDate(i.date),
                                description: i.description,
                                category: i.category,
                                value: formatBRL(i.value),
                                account: i.account_name
                            })),
                            [
                                {header: 'Data', dataKey: 'date'},
                                {header: 'Descrição', dataKey: 'description'},
                                {header: 'Categoria', dataKey: 'category'},
                                {header: 'Conta', dataKey: 'account'},
                                {header: 'Valor', dataKey: 'value'}
                            ],
                            [
                                { label: 'Saldo do Período', value: formatBRL(statementData.reduce((sum, i) => sum + i.value, 0)) }
                            ]
                        )} disabled={generatingPDF}>
                            <Printer className="w-4 h-4 mr-2" /> PDF
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Conta</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {statementData.length > 0 ? statementData.map((item, i) => (
                            <TableRow key={i}>
                                <TableCell>{item.date ? formatDate(item.date) : 'N/A'}</TableCell>
                                <TableCell>{item.description}</TableCell>
                                <TableCell>{item.category}</TableCell>
                                <TableCell>{item.account_name}</TableCell>
                                <TableCell className={`text-right font-medium ${item.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatBRL(item.value)}
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                                    Nenhuma movimentação encontrada no período.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payables" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-red-50 border-red-100">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-red-800">Contas a Pagar</CardTitle>
                            <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-100" onClick={() => handleExportPDF(
                                'A_Pagar', 'Relatório de Contas a Pagar (Aberto)',
                                pendingData.payables.map(p => ({
                                    vencimento: formatDate(p.due_date),
                                    descricao: p.description,
                                    valor: formatBRL(p.amount - (p.paid_amount||0))
                                })),
                                [
                                    {header: 'Vencimento', dataKey: 'vencimento'},
                                    {header: 'Descrição', dataKey: 'descricao'},
                                    {header: 'Valor Pendente', dataKey: 'valor'}
                                ],
                                [{label: 'Total a Pagar', value: formatBRL(pendingData.totalPayables)}]
                            )}>
                                <Printer className="w-4 h-4 mr-2" /> PDF
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-700 mb-4">{formatBRL(pendingData.totalPayables)}</div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingData.payables.slice(0, 10).map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{formatDate(item.due_date)}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={item.description}>{item.description}</TableCell>
                                        <TableCell className="text-right font-medium text-red-600">
                                            {formatBRL(item.amount - (item.paid_amount||0))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {pendingData.payables.length > 10 && (
                            <p className="text-xs text-center mt-2 text-slate-500">Exibindo 10 de {pendingData.payables.length} itens</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-blue-50 border-blue-100">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-blue-800">Contas a Receber</CardTitle>
                             <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-100" onClick={() => handleExportPDF(
                                'A_Receber', 'Relatório de Contas a Receber (Aberto)',
                                pendingData.receivables.map(p => ({
                                    vencimento: formatDate(p.due_date),
                                    descricao: p.description,
                                    valor: formatBRL(p.amount - (p.paid_amount||0))
                                })),
                                [
                                    {header: 'Vencimento', dataKey: 'vencimento'},
                                    {header: 'Descrição', dataKey: 'descricao'},
                                    {header: 'Valor Pendente', dataKey: 'valor'}
                                ],
                                [{label: 'Total a Receber', value: formatBRL(pendingData.totalReceivables)}]
                            )}>
                                <Printer className="w-4 h-4 mr-2" /> PDF
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-700 mb-4">{formatBRL(pendingData.totalReceivables)}</div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingData.receivables.slice(0, 10).map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{formatDate(item.due_date)}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={item.description}>{item.description}</TableCell>
                                        <TableCell className="text-right font-medium text-blue-600">
                                            {formatBRL(item.amount - (item.paid_amount||0))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {pendingData.receivables.length > 10 && (
                            <p className="text-xs text-center mt-2 text-slate-500">Exibindo 10 de {pendingData.receivables.length} itens</p>
                        )}
                    </CardContent>
                </Card>
            </div>
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