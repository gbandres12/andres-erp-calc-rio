import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Calendar, History, Pencil, Trash2, DollarSign } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";

const statusColors = {
  pendente: "bg-yellow-100 text-yellow-800",
  pago: "bg-green-100 text-green-800",
  atrasado: "bg-red-100 text-red-800",
  parcial: "bg-orange-100 text-orange-800"
};

function getDateStatus(transaction) {
  if (transaction.status === "pago") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(transaction.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { type: "atrasado", text: `${Math.abs(diffDays)} dia(s) atrasado`, color: "text-red-600 bg-red-50" };
  if (diffDays === 0) return { type: "hoje", text: "Vence hoje", color: "text-orange-600 bg-orange-50" };
  if (diffDays <= 7) return { type: "proximo", text: `Vence em ${diffDays} dia(s)`, color: "text-yellow-600 bg-yellow-50" };
  return null;
}

function TransactionRow({ transaction, onEdit, onDelete, onReceivePay, onViewPayments }) {
  const remainingAmount = transaction.amount - (transaction.paid_amount || 0) - (transaction.discount || 0);
  const hasPayments = (transaction.paid_amount || 0) > 0;
  const dateStatus = getDateStatus(transaction);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${transaction.type === "receita" ? "bg-green-100" : "bg-red-100"}`}>
          {transaction.type === "receita" ? <TrendingUp className="w-6 h-6 text-green-600" /> : <TrendingDown className="w-6 h-6 text-red-600" />}
        </div>
        <div>
          <p className="font-medium">{transaction.description}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={statusColors[transaction.status]}>{transaction.status}</Badge>
            {transaction.category && <span className="text-xs text-slate-500">{transaction.category}</span>}
            {transaction.contact_name && <span className="text-xs text-slate-500">• {transaction.contact_name}</span>}
            {transaction.cost_center && (
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">CC: {transaction.cost_center}</Badge>
            )}
            {((transaction.discount || 0) > 0 || (transaction.description || "").toLowerCase().includes("abatimento")) && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">Abatimento</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <p className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />Venc: {formatDate(transaction.due_date)}</p>
            {dateStatus && <Badge variant="outline" className={`text-xs ${dateStatus.color} border-current`}>{dateStatus.text}</Badge>}
            {transaction.payment_date && transaction.status === "pago" && (
              <Badge variant="outline" className="text-xs text-green-600 bg-green-50 border-green-200">Pago em: {formatDate(transaction.payment_date)}</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        {(transaction.original_amount > transaction.amount) && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 line-through">{formatBRL(transaction.original_amount)}</span>
            {transaction.discount_type === "porcentagem" && (
              <span className="text-[10px] text-red-400 bg-red-50 px-1 rounded">-{transaction.discount_value}%</span>
            )}
          </div>
        )}
        <p className={`text-xl font-bold ${transaction.type === "receita" ? "text-green-600" : "text-red-600"}`}>{formatBRL(transaction.amount)}</p>
        {hasPayments && (
          <>
            <p className="text-sm text-green-600">Pago: {formatBRL(transaction.paid_amount)}</p>
            <p className="text-sm text-orange-600">Restante: {formatBRL(remainingAmount)}</p>
          </>
        )}
        <div className="flex gap-2 mt-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => onEdit(transaction)} className="text-slate-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(transaction)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
          {transaction.status !== "pago" && (
            <Button size="sm" onClick={() => onReceivePay(transaction)} className="bg-green-600 hover:bg-green-700">
              <DollarSign className="w-4 h-4 mr-1" />{transaction.type === "receita" ? "Receber" : "Pagar"}
            </Button>
          )}
          {hasPayments && (
            <Button size="sm" variant="outline" onClick={() => onViewPayments(transaction)}>
              <History className="w-4 h-4 mr-1" />Ver Histórico
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TransactionRow);