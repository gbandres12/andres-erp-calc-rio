import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";
import { format, parseISO, subDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const getTodayStr = () => new Date().toISOString().split("T")[0];

export default function DailyFinancialReport() {
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [selectedCompanyId] = useState(localStorage.getItem("selectedCompanyId"));

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ company_id: selectedCompanyId, is_active: true }),
    initialData: [],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: selectedCompanyId }, "-created_date"),
    initialData: [],
  });

  const mainAccount = accounts[0];

  // Transações PAGAS no dia selecionado
  const dayTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.status !== "pago") return false;
      const dateToCheck = t.payment_date || t.due_date;
      return dateToCheck && dateToCheck.slice(0, 10) === selectedDate;
    });
  }, [transactions, selectedDate]);

  const entradas = useMemo(
    () => [...dayTransactions.filter((t) => t.type === "receita")].sort((a, b) => a.description.localeCompare(b.description, "pt-BR")),
    [dayTransactions]
  );

  const saidas = useMemo(
    () => [...dayTransactions.filter((t) => t.type === "despesa")].sort((a, b) => a.description.localeCompare(b.description, "pt-BR")),
    [dayTransactions]
  );

  const totalEntradas = entradas.reduce((sum, t) => sum + (t.paid_amount || t.amount || 0), 0);
  const totalSaidas = saidas.reduce((sum, t) => sum + (t.paid_amount || t.amount || 0), 0);

  // Saldo inicial = saldo da conta - entradas + saidas do dia selecionado
  const saldoFinal = mainAccount?.current_balance ?? 0;
  const saldoInicial = saldoFinal - totalEntradas + totalSaidas;

  const goToPrevDay = () => setSelectedDate((d) => subDays(parseISO(d), 1).toISOString().split("T")[0]);
  const goToNextDay = () => setSelectedDate((d) => addDays(parseISO(d), 1).toISOString().split("T")[0]);

  const formattedDateLabel = format(parseISO(selectedDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const handlePrint = () => {
    const entradasRows = entradas.map((t, i) => `
      <tr>
        <td>${String(i + 1).padStart(2, "0")}</td>
        <td>${t.description}</td>
        <td style="color:#16a34a;font-weight:bold;text-align:right">${formatBRL(t.paid_amount || t.amount)}</td>
        <td></td>
      </tr>`).join("");

    const saidasRows = saidas.map((t, i) => `
      <tr>
        <td>${String(i + 1).padStart(2, "0")}</td>
        <td>${t.description}</td>
        <td></td>
        <td style="color:#dc2626;font-weight:bold;text-align:right">${formatBRL(t.paid_amount || t.amount)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Relatório Diário — ${formatDate(selectedDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #64748b; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
    .kpi-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
    .kpi-value { font-size: 14px; font-weight: bold; margin-top: 2px; }
    .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #2563eb; } .slate { color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f1f5f9; font-size: 10px; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; font-size: 10px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .section-title { font-size: 12px; font-weight: bold; margin-bottom: 6px; padding-left: 2px; }
    .total-row td { font-weight: bold; background: #f1f5f9 !important; }
  </style>
</head>
<body>
  <h1>Relatório Diário de Caixa</h1>
  <div class="sub">${formattedDateLabel.charAt(0).toUpperCase() + formattedDateLabel.slice(1)} — Conta: ${mainAccount?.name || "Principal"}</div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Saldo Inicial</div>
      <div class="kpi-value slate">${formatBRL(saldoInicial)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Entradas</div>
      <div class="kpi-value green">${formatBRL(totalEntradas)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Saídas</div>
      <div class="kpi-value red">${formatBRL(totalSaidas)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo Final</div>
      <div class="kpi-value blue">${formatBRL(saldoFinal)}</div>
    </div>
  </div>

  <div class="section-title">📥 Entradas (${entradas.length})</div>
  <table>
    <thead><tr><th style="width:30px">#</th><th>Descrição</th><th style="width:120px;text-align:right">Entrada</th><th style="width:120px;text-align:right">Saída</th></tr></thead>
    <tbody>
      ${entradasRows}
      <tr class="total-row">
        <td colspan="2" style="text-align:right">TOTAL ENTRADA</td>
        <td style="color:#16a34a;text-align:right">${formatBRL(totalEntradas)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">📤 Saídas (${saidas.length})</div>
  <table>
    <thead><tr><th style="width:30px">#</th><th>Descrição</th><th style="width:120px;text-align:right">Entrada</th><th style="width:120px;text-align:right">Saída</th></tr></thead>
    <tbody>
      ${saidasRows}
      <tr class="total-row">
        <td colspan="2" style="text-align:right">TOTAL SAÍDA</td>
        <td></td>
        <td style="color:#dc2626;text-align:right">${formatBRL(totalSaidas)}</td>
      </tr>
    </tbody>
  </table>

  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Relatório Diário de Caixa</h1>
          <p className="text-slate-500 mt-1">
            Conta principal: <span className="font-medium text-slate-700">{mainAccount?.name || "—"}</span>
          </p>
        </div>
        <Button onClick={handlePrint} className="gap-2 bg-slate-800 hover:bg-slate-900">
          <Printer className="w-4 h-4" />
          Imprimir / PDF
        </Button>
      </div>

      {/* Date Navigator */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4 justify-center flex-wrap">
            <Button variant="outline" size="icon" onClick={goToPrevDay}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Data:</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button variant="outline" size="icon" onClick={goToNextDay} disabled={selectedDate >= getTodayStr()}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-slate-600 font-medium capitalize text-sm hidden sm:block">{formattedDateLabel}</span>
            {selectedDate !== getTodayStr() && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(getTodayStr())}>
                Hoje
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo Inicial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">{formatBRL(saldoInicial)}</div>
            <p className="text-xs text-slate-400 mt-1">Início do dia</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-medium text-green-700 uppercase tracking-wide">Total Entradas</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(totalEntradas)}</div>
            <p className="text-xs text-green-500 mt-1">{entradas.length} lançamento(s)</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-medium text-red-700 uppercase tracking-wide">Total Saídas</CardTitle>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{formatBRL(totalSaidas)}</div>
            <p className="text-xs text-red-500 mt-1">{saidas.length} lançamento(s)</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-medium text-blue-700 uppercase tracking-wide">Saldo Final</CardTitle>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{formatBRL(saldoFinal)}</div>
            <p className="text-xs text-blue-500 mt-1">Saldo atual da conta</p>
          </CardContent>
        </Card>
      </div>

      {/* Entradas */}
      <Card className="mb-6">
        <CardHeader className="border-b border-green-100 bg-green-50/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-green-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Entradas do Dia
            </CardTitle>
            <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
              {formatBRL(totalEntradas)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entradas.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nenhuma entrada neste dia</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-2 px-4 font-medium text-slate-500 w-10">#</th>
                  <th className="text-left py-2 px-4 font-medium text-slate-500">Descrição</th>
                  <th className="text-left py-2 px-4 font-medium text-slate-500 hidden md:table-cell">Categoria</th>
                  <th className="text-right py-2 px-4 font-medium text-slate-500">Valor</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((t, i) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-green-50/30">
                    <td className="py-2 px-4 text-slate-400 text-xs">{String(i + 1).padStart(2, "0")}</td>
                    <td className="py-2 px-4 font-medium text-slate-800">{t.description}</td>
                    <td className="py-2 px-4 text-slate-500 text-xs hidden md:table-cell">{t.category || "—"}</td>
                    <td className="py-2 px-4 text-right font-bold text-green-600">{formatBRL(t.paid_amount || t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 border-t-2 border-green-200">
                  <td colSpan={3} className="py-3 px-4 font-bold text-green-800 text-right">TOTAL ENTRADA</td>
                  <td className="py-3 px-4 text-right font-bold text-green-700 text-base">{formatBRL(totalEntradas)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Saídas */}
      <Card>
        <CardHeader className="border-b border-red-100 bg-red-50/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Saídas do Dia
            </CardTitle>
            <span className="text-sm font-semibold text-red-700 bg-red-100 px-3 py-1 rounded-full">
              {formatBRL(totalSaidas)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {saidas.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nenhuma saída neste dia</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-2 px-4 font-medium text-slate-500 w-10">#</th>
                  <th className="text-left py-2 px-4 font-medium text-slate-500">Descrição</th>
                  <th className="text-left py-2 px-4 font-medium text-slate-500 hidden md:table-cell">Categoria</th>
                  <th className="text-right py-2 px-4 font-medium text-slate-500">Valor</th>
                </tr>
              </thead>
              <tbody>
                {saidas.map((t, i) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-red-50/30">
                    <td className="py-2 px-4 text-slate-400 text-xs">{String(i + 1).padStart(2, "0")}</td>
                    <td className="py-2 px-4 font-medium text-slate-800">{t.description}</td>
                    <td className="py-2 px-4 text-slate-500 text-xs hidden md:table-cell">{t.category || "—"}</td>
                    <td className="py-2 px-4 text-right font-bold text-red-600">{formatBRL(t.paid_amount || t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 border-t-2 border-red-200">
                  <td colSpan={3} className="py-3 px-4 font-bold text-red-800 text-right">TOTAL SAÍDA</td>
                  <td className="py-3 px-4 text-right font-bold text-red-700 text-base">{formatBRL(totalSaidas)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}