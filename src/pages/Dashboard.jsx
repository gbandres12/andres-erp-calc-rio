import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Package, Warehouse, TruckIcon, DollarSign, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, RefreshCw, Landmark, MapPin, Search, Package2, Wallet, FileText } from "lucide-react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { createPageUrl } from "@/utils";
import { formatDate, formatBRL } from "@/components/utils/formatters";

const STATUS_META = {
  pago: { label: "Recebido / Liquidado", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  pendente: { label: "Pendente", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  atrasado: { label: "Atrasado", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
  parcial: { label: "Parcial", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700" },
  rascunho: { label: "Rascunho", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
};

export default function Dashboard() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [period, setPeriod] = useState('mes');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unidade';
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const { data: allPaidTransactions = [] } = useQuery({
    queryKey: ['allPaidTransactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({
      company_id: selectedCompanyId,
      status: 'pago'
    }, '-payment_date', 1000),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

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

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({
      company_id: selectedCompanyId
    }, '-sale_date', 100),
    initialData: [],
    staleTime: 5 * 60 * 1000,
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

    const calcStockForProduct = (keywords, excludeKeywords = []) => {
      const matchedProducts = products.filter(p => {
        const name = p.name?.toLowerCase() || "";
        const include = keywords.some(kw => name.includes(kw.toLowerCase()));
        const exclude = excludeKeywords.some(kw => name.includes(kw.toLowerCase()));
        return include && !exclude;
      });
      const matchedIds = matchedProducts.map(p => p.id);
      const totalTons = stockEntries
        .filter(e => matchedIds.includes(e.product_id))
        .reduce((sum, e) => sum + (e.quantity_available || 0), 0);
      const totalCost = stockEntries
        .filter(e => matchedIds.includes(e.product_id))
        .reduce((sum, e) => {
          const product = products.find(p => p.id === e.product_id);
          const cost = e.unit_cost > 0 ? e.unit_cost : (product?.cost_price || 0);
          return sum + (e.quantity_available || 0) * cost;
        }, 0);
      return { tons: totalTons, count: matchedProducts.length, cost: totalCost };
    };

    const britaStock = calcStockForProduct(["brita", "pedra", "calcário", "calcario"]);
    const poStock = calcStockForProduct(["pó", "po", "powder"], ["brita", "pedra"]);

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const sumByTypeAndMonth = (type, month, year) => allPaidTransactions
      .filter(t => t.type === type && t.payment_date)
      .filter(t => {
        const payDate = new Date(t.payment_date);
        return payDate.getMonth() === month && payDate.getFullYear() === year;
      })
      .reduce((sum, t) => sum + (t.paid_amount || t.amount), 0);

    const thisMonthRevenue = sumByTypeAndMonth('receita', thisMonth, thisYear);
    const thisMonthExpenses = sumByTypeAndMonth('despesa', thisMonth, thisYear);

    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthRevenue = sumByTypeAndMonth('receita', prevMonthDate.getMonth(), prevMonthDate.getFullYear());
    const revenueDelta = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : thisMonthRevenue > 0 ? 100 : 0;

    const pendingReceivables = pendingTransactions
      .filter(t => t.type === 'receita')
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

    const pendingPayables = pendingTransactions
      .filter(t => t.type === 'despesa')
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0);

    const clientsCount = contacts.filter(c => c.type === 'cliente' || c.type === 'ambos').length;
    const suppliersCount = contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').length;

    const liquidMargin = thisMonthRevenue - thisMonthExpenses;
    const marginPercent = thisMonthRevenue > 0 ? (liquidMargin / thisMonthRevenue) * 100 : 0;

    return {
      totalStockValueCost,
      totalPotentialSalesValue,
      lowStockProducts,
      thisMonthRevenue,
      thisMonthExpenses,
      lastMonthRevenue,
      revenueDelta,
      pendingReceivables,
      pendingPayables,
      clientsCount,
      suppliersCount,
      britaStock,
      poStock,
      liquidMargin,
      marginPercent,
    };
  }, [stockEntries, products, allPaidTransactions, contacts, pendingTransactions]);

  // Fluxo de caixa diário conforme período selecionado
  const daysBack = period === 'trimestre' ? 90 : period === 'mes' ? Math.max(new Date().getDate(), 7) : 30;

  const dailyCashFlowData = useMemo(() => {
    const grouped = {};
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysBack);
    limitDate.setHours(0, 0, 0, 0);

    for (let i = 0; i <= daysBack; i++) {
      const d = new Date(limitDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      grouped[dateStr] = { date: dateStr, receita: 0, despesa: 0 };
    }

    allPaidTransactions.forEach(t => {
      if (t.payment_date) {
        const tDate = new Date(t.payment_date);
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
        formattedDate: formatDate(item.date).slice(0, 5)
      }));
  }, [allPaidTransactions, daysBack]);

  const dailyAverages = useMemo(() => {
    const days = dailyCashFlowData.length || 1;
    const totalReceita = dailyCashFlowData.reduce((s, d) => s + d.receita, 0);
    const totalDespesa = dailyCashFlowData.reduce((s, d) => s + d.despesa, 0);
    const peak = dailyCashFlowData.reduce((max, d) => d.receita > (max?.receita || 0) ? d : max, null);
    return {
      receita: totalReceita / days,
      despesa: totalDespesa / days,
      peak,
    };
  }, [dailyCashFlowData]);

  const salesChartData = useMemo(() => {
    const grouped = {};
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);

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
        formattedDate: formatDate(item.date).slice(0, 5)
      }));
  }, [sales]);

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

  const COLORS = ['#4f46e5', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444'];

  // Aging de recebíveis (por vencimento)
  const agingData = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = { up7: 0, d8_30: 0, d31_60: 0, overdue: 0 };
    pendingTransactions
      .filter(t => t.type === 'receita')
      .forEach(t => {
        const rest = (t.amount || 0) - (t.paid_amount || 0);
        if (rest <= 0) return;
        if (!t.due_date) { buckets.d31_60 += rest; return; }
        const due = new Date(t.due_date + 'T12:00:00');
        const diff = Math.ceil((due - today) / 86400000);
        if (diff < 0) buckets.overdue += rest;
        else if (diff <= 7) buckets.up7 += rest;
        else if (diff <= 30) buckets.d8_30 += rest;
        else buckets.d31_60 += rest;
      });
    const total = buckets.up7 + buckets.d8_30 + buckets.d31_60 + buckets.overdue;
    return { ...buckets, total };
  }, [pendingTransactions]);

  const agingRows = [
    { key: 'up7', label: 'A vencer até 7 dias', color: 'bg-indigo-600', bar: '#4f46e5', text: 'text-slate-900' },
    { key: 'd8_30', label: 'A vencer em 8-30 dias', color: 'bg-sky-400', bar: '#38bdf8', text: 'text-slate-900' },
    { key: 'd31_60', label: 'A vencer em 31-60 dias', color: 'bg-amber-400', bar: '#fbbf24', text: 'text-slate-900' },
    { key: 'overdue', label: 'Vencidos', color: 'bg-rose-500', bar: '#f43f5e', text: 'text-rose-700', row: 'bg-rose-50/60' },
  ];

  // Busca na tabela de lançamentos
  const filteredTransactions = useMemo(() => {
    if (!search.trim()) return transactions.slice(0, 8);
    const q = search.toLowerCase();
    return transactions.filter(t =>
      (t.description || '').toLowerCase().includes(q) ||
      (t.contact_name || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [transactions, search]);

  const isLoading = loadingProducts || loadingStock || loadingVehicles || loadingTransactions || loadingSales;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 700);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 font-jakarta">
        <div className="max-w-[1400px] mx-auto animate-pulse space-y-6">
          <div className="h-40 bg-white rounded-2xl shadow-sm"></div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-36 bg-white rounded-2xl shadow-sm"></div>)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-44 bg-white rounded-2xl shadow-sm"></div>)}
          </div>
        </div>
      </div>
    );
  }

  const periodOptions = [
    { key: '30d', label: 'Últimos 30 Dias' },
    { key: 'mes', label: 'Este Mês' },
    { key: 'trimestre', label: 'Trimestre' },
  ];

  const stockCards = [
    {
      title: 'Calcário Britado',
      dot: 'bg-emerald-500',
      main: `${stats.britaStock.tons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} TON`,
      sub: `${formatBRL(stats.britaStock.cost)} est.`,
    },
    {
      title: 'Calcário em Pó',
      dot: 'bg-emerald-500',
      main: `${stats.poStock.tons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} TON`,
      sub: `${formatBRL(stats.poStock.cost)} est.`,
    },
    {
      title: 'Estoque a Custo',
      icon: <Wallet className="w-3.5 h-3.5 text-indigo-500" />,
      main: formatBRL(stats.totalStockValueCost),
      sub: 'Custo médio de aquisição',
      footer: `${(stats.britaStock.tons + stats.poStock.tons).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} TON no pátio`,
    },
    {
      title: 'Potencial Bruto',
      main: formatBRL(stats.totalPotentialSalesValue),
      sub: `+${formatBRL(Math.max(stats.totalPotentialSalesValue - stats.totalStockValueCost, 0))} de ganho bruto`,
      subClass: 'text-emerald-600 font-medium',
      footer: `Margem ${stats.totalPotentialSalesValue > 0 ? ((1 - stats.totalStockValueCost / stats.totalPotentialSalesValue) * 100).toFixed(1).replace('.', ',') : '0'}% a preço de venda`,
    },
    {
      title: 'Frota Ativa',
      icon: <TruckIcon className="w-4 h-4 text-indigo-600" />,
      main: `${vehicles.length} ${vehicles.length === 1 ? 'Veículo' : 'Veículos'}`,
      sub: `${stats.clientsCount} clientes ativos`,
      subClass: 'text-indigo-600 font-semibold',
      footer: `${stats.suppliersCount} fornecedores`,
    },
  ];

  const kpiCards = [
    {
      label: 'Faturamento do Mês',
      badge: stats.revenueDelta >= 0
        ? { text: `+${stats.revenueDelta.toFixed(1).replace('.', ',')}%`, cls: 'bg-emerald-50 text-emerald-600', up: true }
        : { text: `${stats.revenueDelta.toFixed(1).replace('.', ',')}%`, cls: 'bg-rose-50 text-rose-600', up: false },
      value: stats.thisMonthRevenue,
      note: `Mês anterior: ${formatBRL(stats.lastMonthRevenue)}`,
      bar: 'bg-emerald-500',
      barWidth: Math.min((stats.thisMonthRevenue / Math.max(stats.lastMonthRevenue, stats.thisMonthRevenue, 1)) * 100, 100),
    },
    {
      label: 'Despesas Operacionais',
      badge: { text: 'Dentro da Meta', cls: 'bg-slate-100 text-slate-600' },
      value: stats.thisMonthExpenses,
      note: 'Diesel, pessoal, energia e fretes',
      bar: 'bg-rose-500',
      barWidth: Math.min((stats.thisMonthExpenses / Math.max(stats.thisMonthRevenue, stats.thisMonthExpenses, 1)) * 100, 100),
    },
    {
      label: 'Contas a Receber (Aberto)',
      badge: { text: `${pendingTransactions.filter(t => t.type === 'receita').length} em aberto`, cls: 'bg-indigo-50 text-indigo-700' },
      value: stats.pendingReceivables,
      note: `${formatBRL(agingData.overdue)} vencidos`,
      bar: 'bg-indigo-600',
      barWidth: Math.min((agingData.up7 / Math.max(agingData.total, 1)) * 100, 100),
    },
    {
      label: 'Contas a Pagar Previstas',
      badge: { text: 'Próx. 30 dias', cls: 'bg-amber-50 text-amber-700' },
      value: stats.pendingPayables,
      note: 'Minerações parceiras e fornecedores',
      bar: 'bg-amber-500',
      barWidth: Math.min((stats.pendingPayables / Math.max(stats.pendingReceivables, stats.pendingPayables, 1)) * 100, 100),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-jakarta">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">

        {/* Command bar */}
        <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-white p-6 rounded-2xl shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                Painel de Controle Corporativo
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium">Ciclo {new Date().getFullYear()} / Q{Math.ceil((new Date().getMonth() + 1) / 3)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Executivo &amp; Financeiro</h1>
            <p className="text-sm text-slate-500 font-medium">Visão estratégica consolidada • Unidade {companyName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center shadow-inner">
              {periodOptions.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${period === p.key ? 'text-white bg-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleRefresh}
              className="p-2.5 text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition shadow-sm"
              title="Atualizar dados agora"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <Link
              to={createPageUrl('Reports')}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <FileText className="w-4 h-4 text-slate-300" />
              Exportar Relatório
            </Link>
          </div>
        </section>

        {/* Gestão Física de Pátio & Estoque */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Gestão Física de Pátio &amp; Estoque Estratégico</h2>
            </div>
            <span className="text-xs text-slate-400">Estoque ativo da filial</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {stockCards.map((c, i) => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="font-medium">{c.title}</span>
                    {c.dot && <span className={`w-2 h-2 rounded-full ${c.dot}`}></span>}
                    {c.icon}
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">{c.main}</div>
                  <div className={`text-xs mt-1 ${c.subClass || 'font-semibold text-slate-600'}`}>{c.sub}</div>
                </div>
                {c.footer && (
                  <div className="mt-3 pt-2 bg-slate-50 -mx-4 -mb-4 px-4 py-2 rounded-b-xl flex items-center justify-between text-[11px] text-slate-500">
                    <span>{c.footer}</span>
                  </div>
                )}
              </div>
            ))}
            {/* Alertas */}
            <div className="bg-amber-50/70 p-4 rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-amber-800 font-bold mb-2">
                  <span>Atenção Estoque</span>
                  {stats.lowStockProducts.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
                </div>
                <div className="text-2xl font-black text-amber-900 tracking-tight">{stats.lowStockProducts.length} <span className="text-xs font-medium text-amber-700">Insumo(s) crítico(s)</span></div>
                <div className="text-[11px] text-amber-800 font-medium mt-1">
                  {stats.lowStockProducts.length > 0
                    ? stats.lowStockProducts.slice(0, 1).map(p => `${p.name} abaixo do mín.`).join(', ')
                    : 'Nenhum produto abaixo do mínimo'}
                </div>
              </div>
              <div className="mt-3 pt-2 bg-amber-100/60 -mx-4 -mb-4 px-4 py-2 rounded-b-xl flex items-center justify-between text-[11px]">
                <span className="text-amber-900 font-semibold">Produtos monitorados</span>
                <span className="font-bold text-amber-950">{products.length}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Métricas Financeiras */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Métricas Financeiras Consolidadas — {companyName}</h2>
            <span className="text-xs font-semibold text-indigo-600">Margem do mês: {stats.marginPercent.toFixed(1).replace('.', ',')}%</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
            {kpiCards.map((k, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{k.label}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${k.badge.cls}`}>
                    {k.badge.up && <TrendingUp className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                    {k.badge.text}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">{formatBRL(k.value)}</div>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{k.note}</p>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className={`${k.bar} h-full rounded-full`} style={{ width: `${k.barWidth}%` }}></div>
                </div>
              </div>
            ))}
            {/* Margem Líquida */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-indigo-200">Margem Líquida</span>
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md">
                  {stats.marginPercent >= 0 ? '+' : ''}{stats.marginPercent.toFixed(1).replace('.', ',')}%
                </span>
              </div>
              <div className="mt-4">
                <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">{formatBRL(stats.liquidMargin)}</div>
                <p className="text-xs text-indigo-200 mt-1 font-medium">Lucro operacional do mês</p>
              </div>
              <div className="mt-4 text-[11px] text-indigo-300/80 flex items-center justify-between">
                <span>Receitas - Despesas</span>
                <span className="font-bold text-white">{formatBRL(stats.thisMonthRevenue)} / {formatBRL(stats.thisMonthExpenses)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Fluxo de caixa + Aging */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Fluxo de Caixa &amp; Movimentação Diária ({period === 'trimestre' ? '90' : daysBack} dias)
                </h3>
                <p className="text-xs text-slate-500">Comparativo contínuo entre entradas confirmadas e saídas operacionais</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-700">Receitas ({formatBRL(dailyCashFlowData.reduce((s, d) => s + d.receita, 0))})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  <span className="text-slate-700">Despesas ({formatBRL(dailyCashFlowData.reduce((s, d) => s + d.despesa, 0))})</span>
                </div>
              </div>
            </div>
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyCashFlowData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="formattedDate" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value, name) => [formatBRL(value), name === 'receita' ? 'Receitas' : 'Despesas']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="receita" stroke="#10b981" strokeWidth={3} fill="url(#revGrad)" name="receita" />
                  <Area type="monotone" dataKey="despesa" stroke="#f43f5e" strokeWidth={2.5} fill="url(#expGrad)" name="despesa" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-3 bg-slate-50 p-3 rounded-xl text-center">
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Pico de Entrada</span>
                <p className="text-sm font-bold text-slate-800">
                  {dailyAverages.peak ? `${formatBRL(dailyAverages.peak.receita)} (${dailyAverages.peak.formattedDate})` : '—'}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Média Diária Receita</span>
                <p className="text-sm font-bold text-emerald-600">{formatBRL(dailyAverages.receita)}/dia</p>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Média Diária Custo</span>
                <p className="text-sm font-bold text-slate-700">{formatBRL(dailyAverages.despesa)}/dia</p>
              </div>
            </div>
          </div>

          {/* Aging de Recebíveis */}
          <div className="lg:col-span-4 bg-white p-6 rounded-2xl shadow-sm space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Aging de Recebíveis</h3>
                <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{formatBRL(agingData.total)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Maturidade das faturas da carteira ativa</p>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex my-5 shadow-inner">
                {agingData.total > 0 && agingRows.map(r => (
                  <div key={r.key} className={`${r.color} h-full`} style={{ width: `${(agingData[r.key] / agingData.total) * 100}%` }} title={r.label} />
                ))}
              </div>
              <div className="space-y-2.5 text-xs">
                {agingRows.map(r => (
                  <div key={r.key} className={`flex items-center justify-between p-2 rounded-lg ${r.row || ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-sm ${r.color}`}></span>
                      <span className="font-semibold text-slate-700">{r.label}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${r.text}`}>{formatBRL(agingData[r.key])}</span>
                      <span className="text-slate-400 text-[10px] ml-1">
                        ({agingData.total > 0 ? ((agingData[r.key] / agingData.total) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Link
              to={createPageUrl('Receivables')}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <FileText className="w-4 h-4 text-slate-600" />
              Ver Contas a Receber
            </Link>
          </div>
        </section>

        {/* Vendas + Categorias + Comparativo mensal */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Vendas (30 dias)</h3>
                <p className="text-xs text-slate-500">Evolução diária do faturamento registrado</p>
              </div>
              <Link to={createPageUrl('Sales')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0">
                Ver todas
              </Link>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesChartData}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="formattedDate" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value) => [formatBRL(value), 'Total Vendido']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="total" name="Total Vendido" stroke="#4f46e5" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Top 5 Categorias de Despesas</h3>
                <p className="text-xs text-slate-500">Distribuição das saídas pagas no período</p>
              </div>
            </div>
            {expensesCategoryData.length > 0 ? (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensesCategoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={95}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {expensesCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatBRL(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">Nenhuma despesa registrada</div>
            )}
          </div>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm">
          <div className="mb-3">
            <h3 className="text-base font-bold text-slate-900">Receitas vs Despesas (Últimos 6 Meses)</h3>
            <p className="text-xs text-slate-500">Comparativo mensal consolidado da filial</p>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={(value, name) => [formatBRL(value), name === 'receitas' ? 'Receitas' : name === 'despesas' ? 'Despesas' : 'Lucro']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="receitas" fill="#10b981" name="Receitas" radius={[6, 6, 0, 0]} />
                <Bar dataKey="despesas" fill="#f43f5e" name="Despesas" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Últimos Lançamentos */}
        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Últimos Lançamentos Financeiros &amp; Operacionais</h3>
              <p className="text-xs text-slate-500 font-medium">Movimentações mais recentes registradas na filial</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 text-xs rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 transition text-slate-800 placeholder-slate-400 w-56 sm:w-64 outline-none"
                  placeholder="Buscar lançamento..."
                  type="text"
                />
              </div>
              <Link to={createPageUrl('Transactions')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0">
                Ver todos os lançamentos
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-slate-50/75 rounded-lg">
                  <th className="py-3 px-4 rounded-l-lg">Descrição do Lançamento</th>
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3">Cliente / Fornecedor</th>
                  <th className="py-3 px-3">Vencimento</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right rounded-r-lg">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTransactions.map((t) => {
                  const meta = STATUS_META[t.status] || STATUS_META.rascunho;
                  const isReceita = t.type === 'receita';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isReceita ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {isReceita ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition">{t.description}</span>
                            {t.contact_name && <div className="text-[11px] text-slate-400">{t.contact_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">{t.category || '—'}</span>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-800">{t.contact_name || '—'}</td>
                      <td className="py-3.5 px-3 text-slate-500 font-medium">
                        {t.due_date ? formatDate(t.due_date) : '—'}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
                          {meta.label}
                        </span>
                      </td>
                      <td className={`py-3.5 px-4 text-right font-black text-sm ${isReceita ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isReceita ? '+' : '-'} {formatBRL(t.amount)}
                      </td>
                    </tr>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      {search ? 'Nenhum lançamento encontrado para a busca' : 'Nenhuma transação registrada'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
            <span className="text-xs text-slate-500">
              Mostrando <strong className="text-slate-800">{filteredTransactions.length}</strong> de <strong className="text-slate-800">{transactions.length}</strong> lançamentos recentes
            </span>
            <Link to={createPageUrl('Transactions')} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition">
              Próxima
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}