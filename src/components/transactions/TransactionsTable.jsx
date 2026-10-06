import { ArrowDown, ArrowUp, History, Pencil, Trash2, DollarSign } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";

const statusStyles = {
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
  atrasado: "bg-red-50 text-red-700 border-red-200",
  parcial: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function TransactionsTable({ rows, selectedIds, onToggle, onToggleAll, onEdit, onDelete, onReceivePay, onViewPayments }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50/80 text-slate-600 font-semibold border-y border-slate-200 select-none text-[11px] uppercase tracking-wider">
          <tr>
            <th className="py-3 pl-4 pr-2 w-10 text-center">
              <input
                type="checkbox"
                className="rounded border-slate-300 accent-violet-600 cursor-pointer"
                checked={rows.length > 0 && rows.every((t) => selectedIds.has(t.id))}
                onChange={onToggleAll}
              />
            </th>
            <th className="py-3 px-2 text-center w-12">Tipo</th>
            <th className="py-3 px-3">Descrição / Categoria</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-3">Vencimento</th>
            <th className="py-3 px-3">Liquidação</th>
            <th className="py-3 px-3 text-right">Valor Total</th>
            <th className="py-3 px-3 text-right">Restante</th>
            <th className="py-3 pr-4 pl-3 text-center w-28">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
          {rows.map((t) => {
            const isRec = t.type === 'receita';
            const remaining = Math.max(0, Number(t.amount || 0) - Number(t.paid_amount || 0) - Number(t.discount || 0));
            const quitado = t.status === 'pago' || remaining <= 0.005;
            return (
              <tr key={t.id} className={`transition-colors group ${isRec ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50/80'}`}>
                <td className="py-3 pl-4 pr-2 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 accent-violet-600 cursor-pointer"
                    checked={selectedIds.has(t.id)}
                    onChange={() => onToggle(t.id)}
                  />
                </td>
                <td className="py-3 px-2 text-center">
                  <span
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-lg border ${isRec ? 'bg-emerald-100/80 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-100'}`}
                    title={isRec ? 'Entrada' : 'Saída'}
                  >
                    {isRec ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="font-bold text-slate-900 text-xs sm:text-sm">{t.description}</div>
                  <div className="text-[11px] text-slate-400 font-normal">
                    {t.category || 'Sem categoria'}{t.contact_name ? ` • ${t.contact_name}` : ''}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${statusStyles[t.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {t.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-500 text-xs font-mono">{t.due_date ? formatDate(t.due_date) : '—'}</td>
                <td className="py-3 px-3">
                  {t.status === 'pago' && t.payment_date ? (
                    <span className="inline-flex items-center text-emerald-700 font-semibold bg-emerald-50/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
                      {formatDate(t.payment_date)}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs font-mono">—</span>
                  )}
                </td>
                <td className={`py-3 px-3 text-right font-mono font-bold text-xs sm:text-sm ${isRec ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isRec ? '+' : '-'}{formatBRL(t.amount)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-xs">
                  {quitado ? (
                    <span className="text-slate-400">R$ 0,00</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">{formatBRL(remaining)}</span>
                  )}
                </td>
                <td className="py-3 pr-4 pl-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onViewPayments(t)} className="p-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition" title="Ver Histórico">
                      <History className="w-4 h-4" />
                    </button>
                    {!quitado && (
                      <button onClick={() => onReceivePay(t)} className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition" title="Receber / Pagar">
                        <DollarSign className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => onEdit(t)} className="p-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete(t)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}