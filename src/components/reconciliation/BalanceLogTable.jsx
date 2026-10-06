import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/components/utils/formatters";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

const OPERATION_LABELS = {
  recalculo: "Recálculo",
  ajuste_manual: "Ajuste manual",
  fechamento: "Fechamento"
};

export default function BalanceLogTable({ entries, loading }) {
  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Carregando log...</div>;
  }
  if (!entries.length) {
    return <div className="p-8 text-center text-sm text-slate-500">Nenhuma alteração de saldo registrada ainda.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data/Hora</TableHead>
          <TableHead>Usuário</TableHead>
          <TableHead>Conta</TableHead>
          <TableHead className="text-right">Antes</TableHead>
          <TableHead className="text-right">Depois</TableHead>
          <TableHead className="text-right">Diferença</TableHead>
          <TableHead>Operação</TableHead>
          <TableHead>Observação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(entry => {
          const diff = entry.difference || 0;
          return (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-slate-600">{formatDateTime(entry.created_date)}</TableCell>
              <TableCell className="text-slate-700">
                {entry.user_name || entry.user_email || "-"}
              </TableCell>
              <TableCell className="font-medium text-slate-800">{entry.account_name || "-"}</TableCell>
              <TableCell className="text-right text-slate-600">{formatBRL(entry.balance_before)}</TableCell>
              <TableCell className="text-right font-semibold">{formatBRL(entry.balance_after)}</TableCell>
              <TableCell className={`text-right font-bold ${diff === 0 ? "text-slate-500" : diff > 0 ? "text-green-700" : "text-red-700"}`}>
                {diff > 0 ? "+" : ""}{formatBRL(diff)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{OPERATION_LABELS[entry.operation] || entry.operation}</Badge>
              </TableCell>
              <TableCell className="text-xs text-slate-500 max-w-48 truncate">{entry.notes || "-"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}