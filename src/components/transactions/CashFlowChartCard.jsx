import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBRL } from "@/components/utils/formatters";
import { subDays, startOfDay } from 'date-fns';

const PERIODS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

export default function CashFlowChartCard({ data }) {
  const [period, setPeriod] = useState(30);

  const chartData = useMemo(() => {
    const cutoff = startOfDay(subDays(new Date(), period));
    return (data || []).filter(d => new Date(`${d.date}T12:00:00`) >= cutoff);
  }, [data, period]);

  return (
    <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Movimentação de Caixa Diária
            <span className="text-xs font-normal text-slate-400 ml-2">(Entradas vs Saídas)</span>
          </h2>
          <p className="text-xs text-slate-500">Fluxo consolidado por data de liquidação</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600">
            {PERIODS.map(p => (
              <button
                key={p.days}
                onClick={() => setPeriod(p.days)}
                className={`px-2.5 py-1 rounded-md transition ${period === p.days ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
              <span>Entrada</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
              <span>Saída</span>
            </div>
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center h-[260px] text-sm text-slate-500">
          Nenhuma movimentação no período selecionado
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={1}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="formattedDate" tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={24} />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                width={48}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                formatter={(value) => formatBRL(value)}
                contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Bar dataKey="receita" name="Entrada" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={10} />
              <Bar dataKey="despesa" name="Saída" fill="#F43F5E" radius={[3, 3, 0, 0]} maxBarSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}