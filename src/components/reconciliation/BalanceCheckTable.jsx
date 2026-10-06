import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

export default function BalanceCheckTable({ results, loading }) {
  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Conferindo saldos...</div>;
  }
  if (!results.length) {
    return <div className="p-8 text-center text-sm text-slate-500">Nenhuma conta encontrada.</div>;
  }

  // Agrupa por empresa para leitura mais fácil
  const byCompany = {};
  results.forEach(r => {
    if (!byCompany[r.company_name]) byCompany[r.company_name] = [];
    byCompany[r.company_name].push(r);
  });

  return (
    <div className="space-y-5">
      {Object.entries(byCompany).map(([companyName, accounts]) => {
        const divergent = accounts.filter(a => !a.ok);
        return (
          <div key={companyName} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
              <h4 className="text-sm font-bold text-slate-800">{companyName}</h4>
              {divergent.length > 0 ? (
                <Badge className="bg-red-100 text-red-700 border border-red-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {divergent.length} conta(s) divergente(s)
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700 border border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Tudo conciliado
                </Badge>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Saldo registrado</TableHead>
                  <TableHead className="text-right">Saldo esperado</TableHead>
                  <TableHead className="text-right">Divergência</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(a => (
                  <TableRow key={a.account_id} className={a.ok ? "" : "bg-red-50/50"}>
                    <TableCell className="font-medium text-slate-800">{a.account_name}</TableCell>
                    <TableCell className="text-right">{formatBRL(a.stored)}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatBRL(a.expected)}</TableCell>
                    <TableCell className={`text-right font-bold ${a.difference === 0 ? "text-slate-500" : a.difference > 0 ? "text-green-700" : "text-red-700"}`}>
                      {a.difference > 0 ? "+" : ""}{formatBRL(a.difference)}
                    </TableCell>
                    <TableCell className="text-center">
                      {a.ok ? (
                        <Badge className="bg-green-100 text-green-700 border border-green-200">OK</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border border-red-200">Divergente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}