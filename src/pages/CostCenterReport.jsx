import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Building2, TrendingUp, TrendingDown, Percent, Layers,
  AlertTriangle, Printer, BarChart3
} from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";

const isAbatimento = (t) =>
  (t.discount || 0) > 0 || (t.description || '').toLowerCase().includes('abatimento');

export default function CostCenterReport() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [period, setPeriod] = useState('month'); // month | quarter | all | custom
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [filterType, setFilterType] = useState('all'); // all | abatimentos | receita | despesa
  const [filterCenter, setFilterCenter] = useState('all');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions-cc', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: selectedCompanyId }, '-created_date', 1000),
    enabled: !!selectedCompanyId,
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-cc'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });
  const company = companies.find(c => c.id === selectedCompanyId);

  // Cálculo do período
  const dateRange = useMemo(() => {
    if (period === 'all') return null;
    if (period === 'custom' && customDates.start && customDates.end) {
      return { start: customDates.start, end: customDates.end };
    }
    const today = new Date();
    const end = today.toISOString().split('T')[0];
    let start = end;
    if (period === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      start = d.toISOString().split('T')[0];
    } else if (period === 'quarter') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      start = d.toISOString().split('T')[0];
    }
    return { start, end };
  }, [period, customDates]);

  // Filtrar transações por período
  const inPeriod = useMemo(() => {
    return transactions.filter(t => {
      if (!dateRange) return true;
      const d = t.payment_date || t.due_date || t.created_date?.slice(0, 10);
      if (!d) return false;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [transactions, dateRange]);

  // Lista de centros de custo existentes
  const costCenters = useMemo(() => {
    const set = new Set();
    inPeriod.forEach(t => {
      if (t.cost_center && t.cost_center.trim()) set.add(t.cost_center.trim());
    });
    return Array.from(set).sort();
  }, [inPeriod]);

  // Filtros aplicados
  const filtered = useMemo(() => {
    return inPeriod.filter(t => {
      if (filterType === 'abatimentos' && !isAbatimento(t)) return false;
      if (filterType === 'receita' && t.type !== 'receita') return false;
      if (filterType === 'despesa' && t.type !== 'despesa') return false;
      if (filterCenter !== 'all') {
        const cc = t.cost_center?.trim() || 'Sem centro';
        if (cc !== filterCenter) return false;
      }
      return true;
    });
  }, [inPeriod, filterType, filterCenter]);

  // Agrupar por centro de custo
  const byCostCenter = useMemo(() => {
    const groups = {};
    filtered.forEach(t => {
      const cc = t.cost_center?.trim() || 'Sem centro de custo';
      if (!groups[cc]) {
        groups[cc] = {
          name: cc,
          entradas: 0,
          saidas: 0,
          abatimentos: 0,
          abatimentos_count: 0,
          items: []
        };
      }
      const ab = isAbatimento(t);
      const val = ab ? (t.discount || t.amount || 0) : (t.paid_amount || t.amount || 0);
      if (t.type === 'receita') {
        groups[cc].entradas += val;
      } else {
        groups[cc].saidas += val;
      }
      if (ab) {
        groups[cc].abatimentos += val;
        groups[cc].abatimentos_count += 1;
      }
      groups[cc].items.push(t);
    });
    return Object.values(groups).sort((a, b) =>
      (b.entradas + b.saidas) - (a.entradas + a.saidas)
    );
  }, [filtered]);

  // Abatimentos isolados
  const abatimentos = useMemo(() => {
    return filtered.filter(isAbatimento).sort((a, b) =>
      (b.payment_date || '').localeCompare(a.payment_date || '')
    );
  }, [filtered]);

  // Totais gerais
  const totals = useMemo(() => {
    let entradas = 0, saidas = 0, abatimentos = 0;
    byCostCenter.forEach(g => {
      entradas += g.entradas;
      saidas += g.saidas;
      abatimentos += g.abatimentos;
    });
    return { entradas, saidas, abatimentos, saldo: entradas - saidas };
  }, [byCostCenter]);

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-40 bg-slate-100 rounded"></div>
          <div className="h-64 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6 no-print">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-8 h-8 text-violet-600" />
            Extrato por Centro de Custo
          </h1>
          <p className="text-slate-500 mt-1">
            {company?.name || 'Filial'} • Pagamentos e abatimentos organizados por centro de custo
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Imprimir
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-6 no-print">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="quarter">Últimos 3 meses</SelectItem>
                  <SelectItem value="all">Todo o período</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={customDates.start}
                    onChange={e => setCustomDates(p => ({ ...p, start: e.target.value }))} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={customDates.end}
                    onChange={e => setCustomDates(p => ({ ...p, end: e.target.value }))} className="w-40" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tudo</SelectItem>
                  <SelectItem value="abatimentos">Apenas abatimentos</SelectItem>
                  <SelectItem value="receita">Entradas</SelectItem>
                  <SelectItem value="despesa">Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Centro de custo</Label>
              <Select value={filterCenter} onValueChange={setFilterCenter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Sem centro">Sem centro de custo</SelectItem>
                  {costCenters.map(cc => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aviso de abatimentos sem centro de custo */}
      {abatimentos.some(a => !a.cost_center) && (
        <Card className="mb-6 border-amber-300 bg-amber-50 no-print">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <strong>{abatimentos.filter(a => !a.cost_center).length} abatimento(s) sem centro de custo.</strong>{' '}
              Edite esses lançamentos em <em>Lançamentos</em> e preencha o campo <em>Centro de Custo</em> para que apareçam agrupados neste extrato.
              Ao registrar novos abatimentos pelo botão Receber/Pagar, o campo de centro de custo agora é exibido.
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-green-100">Entradas</span>
              <TrendingUp className="w-5 h-5 text-green-200" />
            </div>
            <div className="text-2xl font-bold">{formatBRL(totals.entradas)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-red-100">Saídas</span>
              <TrendingDown className="w-5 h-5 text-red-200" />
            </div>
            <div className="text-2xl font-bold">{formatBRL(totals.saidas)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-purple-100">Abatimentos</span>
              <Percent className="w-5 h-5 text-purple-200" />
            </div>
            <div className="text-2xl font-bold">{formatBRL(totals.abatimentos)}</div>
            <div className="text-xs text-purple-200 mt-1">{abatimentos.length} registro(s)</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">Saldo</span>
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <div className={`text-2xl font-bold ${totals.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatBRL(totals.saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por centro de custo */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-violet-600" />
            Resumo por Centro de Custo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byCostCenter.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum lançamento no período selecionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2 px-3">Centro de Custo</th>
                    <th className="py-2 px-3 text-right">Entradas</th>
                    <th className="py-2 px-3 text-right">Saídas</th>
                    <th className="py-2 px-3 text-right">Abatimentos</th>
                    <th className="py-2 px-3 text-right">Saldo</th>
                    <th className="py-2 px-3 text-center">Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {byCostCenter.map(g => {
                    const saldo = g.entradas - g.saidas;
                    const semCentro = g.name === 'Sem centro de custo';
                    return (
                      <tr key={g.name} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            {semCentro ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                Sem centro
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                                {g.name}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-green-600 font-medium">{formatBRL(g.entradas)}</td>
                        <td className="py-3 px-3 text-right text-red-600 font-medium">{formatBRL(g.saidas)}</td>
                        <td className="py-3 px-3 text-right text-purple-700 font-medium">
                          {g.abatimentos > 0 ? formatBRL(g.abatimentos) : '-'}
                          {g.abatimentos_count > 0 && (
                            <span className="block text-xs text-purple-400">{g.abatimentos_count} abat.</span>
                          )}
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBRL(saldo)}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500">{g.items.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-slate-50">
                    <td className="py-3 px-3">TOTAL</td>
                    <td className="py-3 px-3 text-right text-green-600">{formatBRL(totals.entradas)}</td>
                    <td className="py-3 px-3 text-right text-red-600">{formatBRL(totals.saidas)}</td>
                    <td className="py-3 px-3 text-right text-purple-700">{formatBRL(totals.abatimentos)}</td>
                    <td className={`py-3 px-3 text-right ${totals.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatBRL(totals.saldo)}
                    </td>
                    <td className="py-3 px-3 text-center">{filtered.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhamento dos abatimentos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-purple-600" />
            Detalhamento de Abatimentos ({abatimentos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {abatimentos.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Percent className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum abatimento no período.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Descrição</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Centro de Custo</th>
                    <th className="py-2 px-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {abatimentos.map(t => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-600">{formatDate(t.payment_date || t.due_date)}</td>
                      <td className="py-2 px-3 font-medium">{t.description}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={t.type === 'receita'
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"}>
                          {t.type === 'receita' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {t.cost_center ? (
                          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                            {t.cost_center}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            Sem centro
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-purple-700">
                        {formatBRL(t.discount || t.amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}