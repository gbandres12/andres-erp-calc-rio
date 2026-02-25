import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/components/utils/formatters";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import {
  Settings, TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Target, ArrowUpCircle, ArrowDownCircle, Scale
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const WIDGET_DEFS = [
  { id: "kpi_receita", label: "KPI: Total Receitas" },
  { id: "kpi_despesa", label: "KPI: Total Despesas" },
  { id: "kpi_margem", label: "KPI: Margem de Contribuição" },
  { id: "kpi_equilibrio", label: "KPI: Ponto de Equilíbrio" },
  { id: "projecao_fluxo", label: "Gráfico: Projeção de Fluxo de Caixa" },
  { id: "resumo_pendentes", label: "Gráfico: Resumo A Pagar vs A Receber" },
];

const DEFAULT_WIDGETS = WIDGET_DEFS.map(w => w.id);

const HORIZON_OPTIONS = [
  { label: "30 dias", value: 30 },
  { label: "60 dias", value: 60 },
  { label: "90 dias", value: 90 },
];

export default function FinancialOverview({ transactions }) {
  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem("dashboard_widgets");
      return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    } catch { return DEFAULT_WIDGETS; }
  });
  const [horizon, setHorizon] = useState(() => {
    return parseInt(localStorage.getItem("dashboard_horizon") || "30");
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [tempWidgets, setTempWidgets] = useState(visibleWidgets);

  const show = (id) => visibleWidgets.includes(id);

  const handleSaveCustomize = () => {
    setVisibleWidgets(tempWidgets);
    localStorage.setItem("dashboard_widgets", JSON.stringify(tempWidgets));
    setCustomizeOpen(false);
  };

  const handleHorizonChange = (val) => {
    setHorizon(val);
    localStorage.setItem("dashboard_horizon", String(val));
  };

  // --- KPIs ---
  const kpis = useMemo(() => {
    const paid = transactions.filter(t => t.status === "pago");
    const totalReceita = paid.filter(t => t.type === "receita").reduce((s, t) => s + (t.paid_amount || 0), 0);
    const totalDespesa = paid.filter(t => t.type === "despesa").reduce((s, t) => s + (t.paid_amount || 0), 0);
    const margem = totalReceita > 0 ? ((totalReceita - totalDespesa) / totalReceita) * 100 : 0;
    // Ponto de equilíbrio: despesa mensal média / margem de contribuição
    // Simplificado: despesa total / (margem/100)
    const pontoEquilibrio = margem > 0 ? totalDespesa / (margem / 100) : 0;
    return { totalReceita, totalDespesa, margem, pontoEquilibrio };
  }, [transactions]);

  // --- Projeção de Fluxo de Caixa Futuro ---
  const projectionData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = [];

    // Pega transações pendentes/parciais no horizonte
    const future = transactions.filter(t => {
      if (!t.due_date || t.status === "pago") return false;
      const due = new Date(t.due_date);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= horizon;
    });

    // Agrupa por semana ou por dia (se <=30 dias, por dia; senão por semana)
    if (horizon <= 30) {
      for (let i = 0; i <= horizon; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const dayItems = future.filter(t => t.due_date === dateStr);
        const entrada = dayItems.filter(t => t.type === "receita").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
        const saida = dayItems.filter(t => t.type === "despesa").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
        if (entrada > 0 || saida > 0) {
          const [y, m, day] = dateStr.split("-");
          data.push({ name: `${day}/${m}`, entrada, saida, saldo: entrada - saida });
        }
      }
    } else {
      // Agrupado por semana
      const weeks = Math.ceil(horizon / 7);
      for (let w = 0; w < weeks; w++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekItems = future.filter(t => {
          const due = new Date(t.due_date);
          return due >= weekStart && due <= weekEnd;
        });
        const entrada = weekItems.filter(t => t.type === "receita").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
        const saida = weekItems.filter(t => t.type === "despesa").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
        const [d, m] = weekStart.toISOString().split("T")[0].split("-").slice(1).concat(weekStart.toISOString().split("T")[0].split("-")[2]);
        data.push({
          name: `Sem ${w + 1}`,
          entrada,
          saida,
          saldo: entrada - saida
        });
      }
    }
    return data;
  }, [transactions, horizon]);

  // --- Resumo A Pagar vs A Receber ---
  const pendingSummary = useMemo(() => {
    const pending = transactions.filter(t => t.status !== "pago");
    const totalAPagar = pending.filter(t => t.type === "despesa").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
    const totalAReceber = pending.filter(t => t.type === "receita").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
    const atrasadoPagar = pending.filter(t => t.type === "despesa" && t.status === "atrasado").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
    const atrasadoReceber = pending.filter(t => t.type === "receita" && t.status === "atrasado").reduce((s, t) => s + (t.amount - (t.paid_amount || 0)), 0);
    return [
      { name: "A Pagar", total: totalAPagar, atrasado: atrasadoPagar, fill: "#EF4444" },
      { name: "A Receber", total: totalAReceber, atrasado: atrasadoReceber, fill: "#10B981" },
    ];
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Header com controles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-700">Visão Geral Financeira</h2>
        <div className="flex items-center gap-2">
          {/* Horizonte de projeção */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {HORIZON_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleHorizonChange(opt.value)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  horizon === opt.value
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Personalizar */}
          <Dialog open={customizeOpen} onOpenChange={(o) => { setCustomizeOpen(o); if (o) setTempWidgets(visibleWidgets); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="w-4 h-4" /> Personalizar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Personalizar Dashboard</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {WIDGET_DEFS.map(w => (
                  <div key={w.id} className="flex items-center gap-3">
                    <Checkbox
                      id={w.id}
                      checked={tempWidgets.includes(w.id)}
                      onCheckedChange={(checked) => {
                        setTempWidgets(prev =>
                          checked ? [...prev, w.id] : prev.filter(id => id !== w.id)
                        );
                      }}
                    />
                    <Label htmlFor={w.id} className="cursor-pointer">{w.label}</Label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCustomizeOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveCustomize} className="bg-purple-600 hover:bg-purple-700 text-white">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {show("kpi_receita") && (
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-green-100">Receitas (pagas)</CardTitle>
              <ArrowUpCircle className="w-5 h-5 text-green-200" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBRL(kpis.totalReceita)}</div>
            </CardContent>
          </Card>
        )}
        {show("kpi_despesa") && (
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-red-100">Despesas (pagas)</CardTitle>
              <ArrowDownCircle className="w-5 h-5 text-red-200" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBRL(kpis.totalDespesa)}</div>
            </CardContent>
          </Card>
        )}
        {show("kpi_margem") && (
          <Card className={`bg-gradient-to-br text-white ${kpis.margem >= 0 ? "from-blue-500 to-blue-600" : "from-orange-500 to-orange-600"}`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-blue-100">Margem de Contribuição</CardTitle>
              <TrendingUp className="w-5 h-5 text-blue-200" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.margem.toFixed(1)}%</div>
              <p className="text-xs text-blue-200 mt-1">
                {kpis.margem >= 30 ? "✅ Saudável" : kpis.margem >= 10 ? "⚠️ Atenção" : "🔴 Crítico"}
              </p>
            </CardContent>
          </Card>
        )}
        {show("kpi_equilibrio") && (
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-purple-100">Ponto de Equilíbrio</CardTitle>
              <Scale className="w-5 h-5 text-purple-200" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBRL(kpis.pontoEquilibrio)}</div>
              <p className="text-xs text-purple-200 mt-1">receita mínima necessária</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Gráfico de Projeção */}
      {show("projecao_fluxo") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Projeção de Fluxo de Caixa</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Baseado em contas a pagar/receber pendentes — próximos {horizon} dias</p>
              </div>
              {projectionData.length === 0 && (
                <Badge variant="outline" className="text-slate-500">Sem lançamentos futuros</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {projectionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={projectionData}>
                  <defs>
                    <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSaida" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => [formatBRL(value), name === "entrada" ? "A Receber" : name === "saida" ? "A Pagar" : "Saldo"]} />
                  <Legend formatter={(v) => v === "entrada" ? "A Receber" : v === "saida" ? "A Pagar" : "Saldo Líquido"} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="entrada" stroke="#10B981" fill="url(#colorEntrada)" strokeWidth={2} />
                  <Area type="monotone" dataKey="saida" stroke="#EF4444" fill="url(#colorSaida)" strokeWidth={2} />
                  <Area type="monotone" dataKey="saldo" stroke="#6366F1" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                Nenhum lançamento pendente nos próximos {horizon} dias.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resumo A Pagar vs A Receber */}
      {show("resumo_pendentes") && (
        <div className="grid md:grid-cols-2 gap-4">
          {pendingSummary.map((item) => (
            <Card key={item.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {item.name}
                  {item.atrasado > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {formatBRL(item.atrasado)} atrasado
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold mb-2 ${item.name === "A Pagar" ? "text-red-600" : "text-green-600"}`}>
                  {formatBRL(item.total)}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${item.name === "A Pagar" ? "bg-red-500" : "bg-green-500"}`}
                    style={{
                      width: `${Math.min(100, (item.atrasado / (item.total || 1)) * 100)}%`
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {item.total > 0
                    ? `${((item.atrasado / item.total) * 100).toFixed(0)}% em atraso`
                    : "Nenhum lançamento pendente"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}