import { formatBRL } from "@/components/utils/formatters";

export default function DailyAveragesCard({ averages }) {
  const saldo = averages.receita - averages.despesa;
  const positivo = saldo >= 0;

  return (
    <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Médias Diárias</h2>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Filtrado</span>
        </div>

        <div className="space-y-3.5">
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-emerald-900 uppercase tracking-wider block">Entrada Média</span>
              <span className="text-[11px] font-medium text-emerald-700">Base histórica: {averages.days} dias</span>
            </div>
            <div className="text-right">
              <span className="text-xl font-extrabold text-emerald-700 tracking-tight">{formatBRL(averages.receita)}</span>
              <span className="block text-[10px] text-emerald-600/90 font-medium">diários</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-rose-900 uppercase tracking-wider block">Saída Média</span>
              <span className="text-[11px] font-medium text-rose-700">Base histórica: {averages.days} dias</span>
            </div>
            <div className="text-right">
              <span className="text-xl font-extrabold text-rose-700 tracking-tight">{formatBRL(averages.despesa)}</span>
              <span className="block text-[10px] text-rose-600/90 font-medium">diários</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center justify-center text-center p-3 rounded-xl bg-slate-50/80">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Saldo Diário Médio</span>
        <div className={`text-2xl font-black tracking-tight ${positivo ? 'text-blue-600' : 'text-rose-600'}`}>
          {formatBRL(saldo)}
        </div>
        <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
          {positivo ? 'Receita diária superior às saídas no período.' : 'Consumo diário superior à receita apurada no período.'}
        </p>
      </div>
    </div>
  );
}