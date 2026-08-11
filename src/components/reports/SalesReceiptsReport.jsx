import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, DollarSign, Clock, TrendingUp, FileText, Printer } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatBRL, formatDate } from "@/components/utils/formatters";

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function SalesReceiptsReport({ sales, startDate, endDate, onExportCSV, onExportPDF, generatingPDF }) {
  // Filtra vendas pelo período (sale_date) e exclui canceladas
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (s.status === 'cancelada') return false;
      if (!s.sale_date) return false;
      if (startDate && s.sale_date < startDate) return false;
      if (endDate && s.sale_date > endDate) return false;
      return true;
    });
  }, [sales, startDate, endDate]);

  const totalVendido = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalRecebido = filteredSales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
  const totalAbatido = filteredSales.reduce((sum, s) => sum + (s.discount || 0), 0);
  const totalAReceber = filteredSales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);
  const pctRecebimento = totalVendido > 0 ? (totalRecebido / totalVendido) * 100 : 0;

  // Dados mensais: Vendido vs Recebido
  const monthlyData = useMemo(() => {
    const map = {};
    filteredSales.forEach(s => {
      if (!s.sale_date) return;
      const [y, m] = s.sale_date.split('-');
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = { label: `${MONTH_LABELS[parseInt(m) - 1]}/${y.slice(2)}`, vendido: 0, recebido: 0 };
      map[key].vendido += s.total || 0;
      map[key].recebido += s.paid_amount || 0;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filteredSales]);

  const exportColumns = [
    { header: 'Referência', dataKey: 'reference' },
    { header: 'Cliente', dataKey: 'client_name' },
    { header: 'Data', dataKey: 'sale_date_fmt' },
    { header: 'Status Pgto', dataKey: 'payment_status' },
    { header: 'Total Vendido', dataKey: 'total_fmt' },
    { header: 'Recebido', dataKey: 'paid_fmt' },
    { header: 'Abatido', dataKey: 'discount_fmt' },
    { header: 'A Receber', dataKey: 'remaining_fmt' }
  ];

  const exportData = filteredSales.map(s => ({
    reference: s.reference,
    client_name: s.client_name || '',
    sale_date: s.sale_date,
    sale_date_fmt: formatDate(s.sale_date),
    payment_status: s.payment_status,
    total: s.total,
    total_fmt: formatBRL(s.total || 0),
    paid_amount: s.paid_amount,
    paid_fmt: formatBRL(s.paid_amount || 0),
    discount: s.discount,
    discount_fmt: formatBRL(s.discount || 0),
    remaining_amount: s.remaining_amount,
    remaining_fmt: formatBRL(s.remaining_amount || 0)
  }));

  const statusColors = {
    pago: "bg-green-100 text-green-800",
    parcial: "bg-orange-100 text-orange-800",
    pendente: "bg-yellow-100 text-yellow-800"
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Total Vendido</CardTitle>
            <ShoppingCart className="h-5 w-5 text-purple-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBRL(totalVendido)}</div>
            <p className="text-xs text-purple-200 mt-1">{filteredSales.length} vendas (promessa)</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Total Recebido</CardTitle>
            <DollarSign className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBRL(totalRecebido)}</div>
            <p className="text-xs text-green-200 mt-1">efetivamente pago</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">A Receber</CardTitle>
            <Clock className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBRL(totalAReceber)}</div>
            <p className="text-xs text-orange-200 mt-1">saldo pendente</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">% Recebimento</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pctRecebimento.toFixed(1)}%</div>
            <p className="text-xs text-blue-200 mt-1">recebido / vendido</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Vendido x Recebido */}
      <Card>
        <CardHeader>
          <CardTitle>Vendido x Recebido por Mês</CardTitle>
          <p className="text-sm text-slate-500">Período: {formatDate(startDate)} a {formatDate(endDate)}</p>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Nenhuma venda no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatBRL(value)} />
                <Legend />
                <Bar dataKey="vendido" name="Vendido" fill="#A855F7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Detalhamento por Venda</CardTitle>
              <p className="text-sm text-slate-500 mt-1">Compare o valor vendido com o quanto foi efetivamente pago</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onExportCSV(exportData, 'vendas_x_recebimento', exportColumns)}>
                <FileText className="w-4 h-4 mr-2" /> CSV
              </Button>
              <Button size="sm" onClick={() => onExportPDF(
                'Vendas_Recebimento',
                'Relatório de Vendas x Recebimento',
                exportData.map(d => ({
                  referencia: d.reference,
                  cliente: d.client_name,
                  data: d.sale_date_fmt,
                  status: d.payment_status,
                  vendido: d.total_fmt,
                  recebido: d.paid_fmt,
                  abatido: d.discount_fmt,
                  a_receber: d.remaining_fmt
                })),
                [
                  { header: 'Referência', dataKey: 'referencia' },
                  { header: 'Cliente', dataKey: 'cliente' },
                  { header: 'Data', dataKey: 'data' },
                  { header: 'Status', dataKey: 'status' },
                  { header: 'Vendido', dataKey: 'vendido' },
                  { header: 'Recebido', dataKey: 'recebido' },
                  { header: 'Abatido', dataKey: 'abatido' },
                  { header: 'A Receber', dataKey: 'a_receber' }
                ],
                [
                  { label: 'Total Vendido', value: formatBRL(totalVendido) },
                  { label: 'Total Recebido', value: formatBRL(totalRecebido) },
                  { label: 'Total Abatido', value: formatBRL(totalAbatido) },
                  { label: 'Total a Receber', value: formatBRL(totalAReceber) }
                ]
              )} disabled={generatingPDF}>
                <Printer className="w-4 h-4 mr-2" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referência</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Abatido</TableHead>
                <TableHead className="text-right">A Receber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                    Nenhuma venda encontrada no período.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.slice(0, 50).map(sale => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.reference}</TableCell>
                    <TableCell>{sale.client_name}</TableCell>
                    <TableCell>{formatDate(sale.sale_date)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[sale.payment_status] || "bg-slate-100 text-slate-800"}>
                        {sale.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-purple-700">{formatBRL(sale.total || 0)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatBRL(sale.paid_amount || 0)}</TableCell>
                    <TableCell className="text-right text-purple-600">{formatBRL(sale.discount || 0)}</TableCell>
                    <TableCell className="text-right font-medium text-orange-600">{formatBRL(sale.remaining_amount || 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredSales.length > 50 && (
            <p className="text-xs text-center mt-2 text-slate-500">
              Exibindo 50 de {filteredSales.length} vendas. Exporte para ver todas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}