import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, RefreshCw, Search, FileText, PackageCheck,
  Building2, Radio, ArrowRight, AlertTriangle, Receipt, Wallet, RadioTower
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { createPageUrl } from "@/utils";
import { formatDate, formatDateTime, formatBRL } from "@/components/utils/formatters";

const STATUS_META = {
  pago: { label: "Recebido / Liquidado", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  pendente: { label: "Pendente", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  atrasado: { label: "Atrasado", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
  parcial: { label: "Parcial", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700" },
};

const NF_STATUS_META = {
  autorizada: { label: "Autorizada", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  enviada: { label: "Enviada", cls: "bg-sky-50 text-sky-700 border border-sky-200" },
  processando: { label: "Processando", cls: "bg-sky-50 text-sky-700 border border-sky-200" },
  validando: { label: "Validando", cls: "bg-sky-50 text-sky-700 border border-sky-200" },
  pendente_envio: { label: "Pendente envio", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  rascunho: { label: "Rascunho", cls: "bg-slate-100 text-slate-600 border border-slate-200" },
  rejeitada: { label: "Rejeitada", cls: "bg-rose-50 text-rose-700 border border-rose-200" },
  erro_integracao: { label: "Erro integração", cls: "bg-rose-50 text-rose-700 border border-rose-200" },
  cancelada: { label: "Cancelada", cls: "bg-slate-100 text-slate-500 border border-slate-200" },
  inutilizada: { label: "Inutilizada", cls: "bg-slate-100 text-slate-500 border border-slate-200" },
};

const COMPANY_COLORS = ['#4f46e5', '#0891b2', '#d97706'];

export default function Gerencial() {
  const [period, setPeriod] = useState('mes');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Ao vivo: qualquer movimentação em qualquer filial recarrega os dados (debounce)
  useEffect(() => {
    let timer = null;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries(), 2000);
    };
    const unsubs = ['Sale', 'Transaction'].map(name => {
      try {
        return base44.entities[name].subscribe(scheduleRefresh);
      } catch { return null; }
    });
    return () => {
      clearTimeout(timer);
      unsubs.forEach(u => u && u());
    };
  }, [queryClient]);

  const { data: companies = [], isPending: loadingCompanies } = useQuery({
    queryKey: ['ger-companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['ger-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: stockEntries = [] } = useQuery({
    queryKey: ['ger-stock'],
    queryFn: () => base44.entities.StockEntry.filter({ status: 'ativo' }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['ger-vehicles'],
    queryFn: () => base44.entities.Vehicle.filter({ status: 'ativo' }),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: paidTransactions = [] } = useQuery({
    queryKey: ['ger-paid'],
    queryFn: () => base44.entities.Transaction.filter({ status: 'pago' }, '-payment_date', 1000),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: pendingTransactions = [] } = useQuery({
    queryKey: ['ger-pending'],
    queryFn: async () => {
      const [pendente, parcial, atrasado] = await Promise.all([
        base44.entities.Transaction.filter({ status: 'pendente' }, '-due_date', 500),
        base44.entities.Transaction.filter({ status: 'parcial' }, '-due_date', 500),
        base44.entities.Transaction.filter({ status: 'atrasado' }, '-due_date', 500)
      ]);
      return [...pendente, ...parcial, ...atrasado];
    },
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: recentTransactions = [], isPending: loadingRecent } = useQuery({
    queryKey: ['ger-recent-transactions'],
    queryFn: () => base44.entities.Transaction.filter({}, '-created_date', 50),
    staleTime: 60 * 1000,
  });

  const { data: fiscalInvoices = [] } = useQuery({
    queryKey: ['ger-invoices'],
    queryFn: () => base44.entities.FiscalInvoice.filter({}, '-created_date', 25),
    initialData: [],
    staleTime: 60 * 1000,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['ger-withdrawals'],
    queryFn: () => base44.entities.SaleWithdrawal.filter({}, '-created_date', 15),
    initialData: [],
    staleTime: 60 * 1000,
  });

  const isLoading = loadingCompanies || loadingRecent;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 700);
  };

  const companyName = (id) => companies.find(c => c.id === id)?.name || id?.slice(0, 8) || '—';

  const daysBack = period === 'trimestre' ? 90 : period === 'mes' ? Math.max(new Date().getDate(), 7) : 30;

  // Fluxo de caixa consolidado (todas as filiais)
  const dailyCashFlow = useMemo(() => {
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
    paidTransactions.forEach(t => {
      if (!t.payment_date) return;
      const tDate = new Date(t.payment_date);
      const dateStr = t.payment_date.split('T')[0];
      if (tDate >= limitDate && grouped[dateStr]) {
        if (t.type === 'receita') grouped[dateStr].receita += (t.paid_amount || t.amount);
        else grouped[dateStr].despesa += (t.paid_amount || t.amount);
      }
    });
    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({ ...item, formattedDate: formatDate(item.date).slice(0, 5) }));
  }, [paidTransactions, daysBack]);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // Estatísticas por filial + consolidadas
  const perCompany = useMemo(() => {
    const map = {};
    companies.forEach(c => { map[c.id] = { company: c, tons: 0, stockCost: 0, revenue: 0, expenses: 0, receivables: 0, payables: 0, invoices: 0, vehicles: 0 }; });

    stockEntries.forEach(e => {
      const m = map[e.company_id];
      if (!m) return;
      const product = products.find(p => p.id === e.product_id);
      const cost = e.unit_cost > 0 ? e.unit_cost : (product?.cost_price || 0);
      m.tons += e.quantity_available || 0;
      m.stockCost += (e.quantity_available || 0) * cost;
    });
    vehicles.forEach(v => { if (map[v.company_id]) map[v.company_id].vehicles += 1; });

    paidTransactions.forEach(t => {
      const m = map[t.company_id];
      if (!m || !t.payment_date) return;
      const payDate = new Date(t.payment_date);
      if (payDate.getMonth() === thisMonth && payDate.getFullYear() === thisYear) {
        if (t.type === 'receita') m.revenue += (t.paid_amount || t.amount);
        else m.expenses += (t.paid_amount || t.amount);
      }
    });
    pendingTransactions.forEach(t => {
      const m = map[t.company_id];
      if (!m) return;
      const rest = (t.amount || 0) - (t.paid_amount || 0);
      if (rest <= 0) return;
      if (t.type === 'receita') m.receivables += rest;
      else m.payables += rest;
    });
    fiscalInvoices.forEach(n => {
      const m = map[n.company_id];
      if (m && (n.status === 'autorizada' || n.status === 'enviada' || n.status === 'processando')) m.invoices += 1;
    });

    return Object.values(map);
  }, [companies, stockEntries, products, vehicles, paidTransactions, pendingTransactions, fiscalInvoices, thisMonth, thisYear]);

  const consolidated = useMemo(() => {
    const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
    let lastMonthRevenue = 0;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    paidTransactions.forEach(t => {
      if (t.type !== 'receita' || !t.payment_date) return;
      const payDate = new Date(t.payment_date);
      if (payDate.getMonth() === prev.getMonth() && payDate.getFullYear() === prev.getFullYear()) {
        lastMonthRevenue += (t.paid_amount || t.amount);
      }
    });
    const revenue = sum(perCompany, c => c.revenue);
    const expenses = sum(perCompany, c => c.expenses);
    const revenueDelta = lastMonthRevenue > 0 ? ((revenue - lastMonthRevenue) / lastMonthRevenue) * 100 : revenue > 0 ? 100 : 0;
    return {
      tons: sum(perCompany, c => c.tons),
      stockCost: sum(perCompany, c => c.stockCost),
      revenue,
      expenses,
      lastMonthRevenue,
      revenueDelta,
      receivables: sum(perCompany, c => c.receivables),
      payables: sum(perCompany, c => c.payables),
      liquidMargin: revenue - expenses,
      marginPercent: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
      vehicles: sum(perCompany, c => c.vehicles),
      invoices: sum(perCompany, c => c.invoices),
    };
  }, [perCompany, paidTransactions, paidTransactions]);

  // Aging consolidado de recebíveis
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
    return { ...buckets, total: buckets.up7 + buckets.d8_30 + buckets.d31_60 + buckets.overdue };
  }, [pendingTransactions]);

  const agingRows = [
    { key: 'up7', label: 'A vencer até 7 dias', color: 'bg-indigo-600' },
    { key: 'd8_30', label: 'A vencer em 8-30 dias', color: 'bg-sky-400' },
    { key: 'd31_60', label: 'A vencer em 31-60 dias', color: 'bg-amber-400' },
    { key: 'overdue', label: 'Vencidos', color: 'bg-rose-500', row: 'bg-rose-50/60', text: 'text-rose-700' },
  ];

  const filteredTransactions = useMemo(() => {
    const list = search.trim()
      ? recentTransactions.filter(t =>
          (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
          (t.contact_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (t.category || '').toLowerCase().includes(search.toLowerCase()) ||
          companyName(t.company_id).toLowerCase().includes(search.toLowerCase()))
      : recentTransactions;
    return list.slice(0, 12);
  }, [recentTransactions, search, companies]);

  const acessarFilial = (c) => {
    localStorage.setItem('selectedCompanyId', c.id);
    localStorage.setItem('selectedCompanyName', c.name);
    window.dispatchEvent(new Event('branch-changed'));
    queryClient.invalidateQueries();
    navigate(createPageUrl('Dashboard'));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 font-jakarta">
        <div className="max-w-[1400px] mx-auto animate-pulse space-y-6">
          <div className="h-40 bg-white rounded-2xl shadow-sm"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => <div key={i} className="h-64 bg-white rounded-2xl shadow-sm"></div>)}
          </div>
          <div className="h-56 bg-white rounded-2xl shadow-sm"></div>
        </div>
      </div>
    );
  }

  const periodOptions = [
    { key: '30d', label: 'Últimos 30 Dias' },
    { key: 'mes', label: 'Este Mês' },
    { key: 'trimestre', label: 'Trimestre' },
  ];

  const kpiCards = [
    {
      label: 'Faturamento Consolidado',
      badge: consolidated.revenueDelta >= 0
        ? { text: `+${consolidated.revenueDelta.toFixed(1).replace('.', ',')}%`, cls: 'bg-emerald-50 text-emerald-600', up: true }
        : { text: `${consolidated.revenueDelta.toFixed(1).replace('.', ',')}%`, cls: 'bg-rose-50 text-rose-600' },
      value: consolidated.revenue,
      note: `Mês anterior: ${formatBRL(consolidated.lastMonthRevenue)}`,
      bar: 'bg-emerald-500',
      barWidth: Math.min((consolidated.revenue / Math.max(consolidated.lastMonthRevenue, consolidated.revenue, 1)) * 100, 100),
    },
    {
      label: 'Despesas Operacionais',
      badge: { text: 'Todas as filiais', cls: 'bg-slate-100 text-slate-600' },
      value: consolidated.expenses,
      note: 'Diesel, pessoal, energia e fretes',
      bar: 'bg-rose-500',
      barWidth: Math.min((consolidated.expenses / Math.max(consolidated.revenue, consolidated.expenses, 1)) * 100, 100),
    },
    {
      label: 'A Receber (Grupo)',
      badge: { text: 'Carteira total', cls: 'bg-indigo-50 text-indigo-700' },
      value: consolidated.receivables,
      note: `${formatBRL(agingData.overdue)} vencidos`,
      bar: 'bg-indigo-600',
      barWidth: Math.min((agingData.up7 / Math.max(agingData.total, 1)) * 100, 100),
    },
    {
      label: 'A Pagar (Grupo)',
      badge: { text: 'Previstas', cls: 'bg-amber-50 text-amber-700' },
      value: consolidated.payables,
      note: 'Fornecedores e parceiros',
      bar: 'bg-amber-500',
      barWidth: Math.min((consolidated.payables / Math.max(consolidated.receivables, consolidated.payables, 1)) * 100, 100),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-jakarta">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">

        {/* Command bar */}
        <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-white p-6 rounded-2xl shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                <RadioTower className="w-3 h-3" />
                Painel Gerencial Consolidado
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Ao vivo
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium">{companies.length} empresas • Ciclo {now.getFullYear()} / Q{Math.ceil((thisMonth + 1) / 3)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Painel Gerencial do Grupo</h1>
            <p className="text-sm text-slate-500 font-medium">Movimentações ao vivo de todas as filiais • notas, retiradas e lançamentos</p>
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
              Relatórios
            </Link>
          </div>
        </section>

        {/* Filiais ao vivo — acesso ao painel de cada empresa */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Filiais ao Vivo — Acesso Rápido ao Painel de Cada Empresa</h2>
            </div>
            <span className="text-xs text-slate-400">Atualização em tempo real</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {perCompany.map((c, i) => {
              const color = COMPANY_COLORS[i % COMPANY_COLORS.length];
              const margin = c.revenue > 0 ? ((c.revenue - c.expenses) / c.revenue) * 100 : 0;
              return (
                <div key={c.company.id} className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-3.5 flex items-center justify-between" style={{ backgroundColor: color }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-white/80 flex-shrink-0" />
                      <span className="font-bold text-white text-sm truncate">{c.company.name}</span>
                    </div>
                    {c.company.code && <span className="text-[10px] font-bold text-white/70 flex-shrink-0">({c.company.code})</span>}
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-x-4 gap-y-4 flex-1">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estoque</span>
                      <div className="text-lg font-black text-slate-900">{c.tons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-xs font-semibold text-slate-500">TON</span></div>
                      <div className="text-[10px] text-slate-400">{formatBRL(c.stockCost)} a custo</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Faturamento (mês)</span>
                      <div className="text-lg font-black text-emerald-600">{formatBRL(c.revenue)}</div>
                      <div className="text-[10px] text-slate-400">{formatBRL(c.expenses)} de saídas</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">A Receber</span>
                      <div className="text-base font-black text-indigo-700">{formatBRL(c.receivables)}</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">A Pagar</span>
                      <div className="text-base font-black text-amber-600">{formatBRL(c.payables)}</div>
                    </div>
                    <div className="col-span-2 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-[11px]">
                      <span className="text-slate-500 font-medium">Margem: <strong className={margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{margin.toFixed(1).replace('.', ',')}%</strong></span>
                      <span className="text-slate-500 font-medium">Veículos: <strong className="text-slate-800">{c.vehicles}</strong></span>
                      <span className="text-slate-500 font-medium">NF-e ativas: <strong className="text-slate-800">{c.invoices}</strong></span>
                    </div>
                  </div>
                  <button
                    onClick={() => acessarFilial(c.company)}
                    className="m-5 mt-0 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition text-white shadow-sm hover:opacity-90"
                    style={{ backgroundColor: color }}
                  >
                    Acessar Painel Executivo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* KPIs consolidados */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Métricas Financeiras Consolidadas — Todas as Filiais</h2>
            <span className="text-xs font-semibold text-indigo-600">Margem do grupo: {consolidated.marginPercent.toFixed(1).replace('.', ',')}%</span>
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
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-indigo-200">Margem Líquida</span>
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md">
                  {consolidated.marginPercent >= 0 ? '+' : ''}{consolidated.marginPercent.toFixed(1).replace('.', ',')}%
                </span>
              </div>
              <div className="mt-4">
                <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">{formatBRL(consolidated.liquidMargin)}</div>
                <p className="text-xs text-indigo-200 mt-1 font-medium">Lucro operacional do grupo no mês</p>
              </div>
              <div className="mt-4 text-[11px] text-indigo-300/80 flex items-center justify-between">
                <span>{consolidated.tons.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} TON • {consolidated.invoices} NF-e • {consolidated.vehicles} veículos</span>
              </div>
            </div>
          </div>
        </section>

        {/* Fluxo consolidado + Aging */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Fluxo de Caixa do Grupo ({period === 'trimestre' ? '90' : daysBack} dias)
                </h3>
                <p className="text-xs text-slate-500">Somatório das movimentações confirmadas em todas as filiais</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-700">Receitas ({formatBRL(dailyCashFlow.reduce((s, d) => s + d.receita, 0))})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  <span className="text-slate-700">Despesas ({formatBRL(dailyCashFlow.reduce((s, d) => s + d.despesa, 0))})</span>
                </div>
              </div>
            </div>
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyCashFlow}>
                  <defs>
                    <linearGradient id="gerRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gerExpGrad" x1="0" y1="0" x2="0" y2="1">
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
                  <Area type="monotone" dataKey="receita" stroke="#10b981" strokeWidth={3} fill="url(#gerRevGrad)" name="receita" />
                  <Area type="monotone" dataKey="despesa" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gerExpGrad)" name="despesa" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 rounded-2xl shadow-sm space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Aging de Recebíveis</h3>
                <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{formatBRL(agingData.total)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Carteira ativa de todas as filiais</p>
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
                      <span className={`font-bold ${r.text || 'text-slate-900'}`}>{formatBRL(agingData[r.key])}</span>
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

        {/* Notas Fiscais */}
        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                Últimas Notas Fiscais (NF-e)
              </h3>
              <p className="text-xs text-slate-500 font-medium">Situação SEFAZ das emissões de todas as filiais</p>
            </div>
            <Link to={createPageUrl('FiscalInvoices')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0">
              Ver todas as notas
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-slate-50/75">
                  <th className="py-3 px-4 rounded-l-lg">Número / Série</th>
                  <th className="py-3 px-3">Filial</th>
                  <th className="py-3 px-3">Destinatário</th>
                  <th className="py-3 px-3">Natureza</th>
                  <th className="py-3 px-3">Emissão</th>
                  <th className="py-3 px-3">Status SEFAZ</th>
                  <th className="py-3 px-4 text-right rounded-r-lg">Total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {fiscalInvoices.map(n => {
                  const meta = NF_STATUS_META[n.status] || NF_STATUS_META.rascunho;
                  return (
                    <tr key={n.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <Link
                          to={`${createPageUrl('FiscalInvoiceDetail')}?id=${n.id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition"
                        >
                          NF {n.number || '—'} <span className="text-slate-400 font-medium">/ {n.serie || '1'}</span>
                        </Link>
                        <div className="text-[11px] text-slate-400">{n.document_type?.toUpperCase()}</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: COMPANY_COLORS[companies.findIndex(c => c.id === n.company_id) % 3] || '#64748b' }}>
                          {companyName(n.company_id)}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-800">{n.recipient_name || '—'}</td>
                      <td className="py-3.5 px-3 text-slate-500 font-medium">{n.nature_operation || '—'}</td>
                      <td className="py-3.5 px-3 text-slate-500 font-medium">{n.issue_date ? formatDate(n.issue_date) : '—'}</td>
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-sm text-slate-900">{formatBRL(n.total)}</td>
                    </tr>
                  );
                })}
                {fiscalInvoices.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Nenhuma nota fiscal registrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Últimas Retiradas + Lançamentos */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-emerald-600" />
                  Últimas Retiradas
                </h3>
                <p className="text-xs text-slate-500 font-medium">Saídas de produto registradas no grupo</p>
              </div>
              <Link to={createPageUrl('SaleWithdrawals')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0">
                Ver todas
              </Link>
            </div>
            <div className="space-y-2.5">
              {withdrawals.slice(0, 8).map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{w.product_name || 'Produto'}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {companyName(w.company_id)} • {w.sale_reference || '—'} {w.vehicle_plate ? `• ${w.vehicle_plate}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-black text-slate-900">{(w.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <span className="text-[10px] font-semibold text-slate-500">{w.unit || ''}</span></p>
                    <p className="text-[10px] text-slate-400">{w.withdrawal_date ? formatDateTime(w.withdrawal_date) : '—'}</p>
                  </div>
                </div>
              ))}
              {withdrawals.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">Nenhuma retirada registrada</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Últimos Lançamentos Financeiros</h3>
                <p className="text-xs text-slate-500 font-medium">Movimentações recentes de todas as filiais</p>
              </div>
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
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-slate-50/75">
                    <th className="py-3 px-4 rounded-l-lg">Descrição</th>
                    <th className="py-3 px-3">Filial</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right rounded-r-lg">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTransactions.map(t => {
                    const meta = STATUS_META[t.status] || { label: t.status || '—', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600' };
                    const isReceita = t.type === 'receita';
                    const ci = companies.findIndex(c => c.id === t.company_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isReceita ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {isReceita ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">{t.description}</span>
                              {t.contact_name && <div className="text-[11px] text-slate-400">{t.contact_name}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: COMPANY_COLORS[ci % 3] || '#64748b' }}>
                            {companyName(t.company_id)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.chip}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
                            {meta.label}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-black text-sm ${isReceita ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isReceita ? '+' : '-'} {formatBRL(t.amount)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-400">
                      {search ? 'Nenhum lançamento encontrado para a busca' : 'Nenhuma transação registrada'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}