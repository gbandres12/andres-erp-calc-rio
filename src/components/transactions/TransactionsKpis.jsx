import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";

export default function TransactionsKpis({ kpis }) {
  const saldoPositivo = (kpis.saldoReal || 0) >= 0;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Entradas */}
      <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/15 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Entradas</span>
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="my-3 text-2xl font-extrabold tracking-tight">{formatBRL(kpis.totalReceita)}</div>
        <div className="flex items-center justify-between text-xs text-emerald-100 pt-1 border-t border-emerald-500/40">
          <span className="font-medium">Recebido no período</span>
        </div>
      </div>

      {/* Saídas */}
      <div className="bg-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-600/15 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-100">Saídas</span>
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>
        <div className="my-3 text-2xl font-extrabold tracking-tight">{formatBRL(kpis.totalDespesa)}</div>
        <div className="flex items-center justify-between text-xs text-rose-100 pt-1 border-t border-rose-500/40">
          <span className="font-medium">Total Pago</span>
        </div>
      </div>

      {/* Saldo Líquido */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Caixa Real</span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${saldoPositivo ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className={`my-3 text-2xl font-extrabold tracking-tight ${saldoPositivo ? 'text-emerald-600' : 'text-rose-600'}`}>
          {formatBRL(kpis.saldoReal || 0)}
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>Soma dos saldos das contas</span>
        </div>
      </div>

      {/* A Receber */}
      <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-600/15 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-100">A Receber</span>
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="my-3 text-2xl font-extrabold tracking-tight">{formatBRL(kpis.pendingReceivables)}</div>
        <div className="flex items-center justify-between text-xs text-blue-100 pt-1 border-t border-blue-500/40">
          <span className="font-medium">Previsão em aberto</span>
          <span className="text-[11px] bg-blue-700/50 px-1.5 py-0.5 rounded font-semibold">
            {kpis.pendingReceivablesCount} {kpis.pendingReceivablesCount === 1 ? 'título' : 'títulos'}
          </span>
        </div>
      </div>

      {/* A Pagar */}
      <div className="bg-orange-600 rounded-2xl p-5 text-white shadow-lg shadow-orange-600/15 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-orange-100">A Pagar</span>
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="my-3 text-2xl font-extrabold tracking-tight">{formatBRL(kpis.pendingPayables)}</div>
        <div className="flex items-center justify-between text-xs text-orange-100 pt-1 border-t border-orange-500/40">
          <span className="font-medium">Pendências ativas</span>
          <span className="text-[11px] bg-orange-700/50 px-1.5 py-0.5 rounded font-semibold">
            {kpis.pendingPayablesCount} {kpis.pendingPayablesCount === 1 ? 'título' : 'títulos'}
          </span>
        </div>
      </div>
    </section>
  );
}