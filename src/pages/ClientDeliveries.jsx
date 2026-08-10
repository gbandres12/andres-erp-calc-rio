import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BarterDialog } from "@/components/barter/BarterDialog";
import {
  TruckIcon, Users, Package, Wheat, ArrowLeftRight, Plus, Scale
} from "lucide-react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";
import { toast } from "sonner";

export default function ClientDeliveries() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [barterOpen, setBarterOpen] = useState(false);
  const [barterSearch, setBarterSearch] = useState("");
  const queryClient = useQueryClient();

  // Pesagens (carregamentos) da filial
  const { data: weighings = [], isLoading } = useQuery({
    queryKey: ['weighings-deliveries', selectedCompanyId],
    queryFn: () => base44.entities.Weighing.filter({ company_id: selectedCompanyId }, '-gross_datetime', 1000),
    enabled: !!selectedCompanyId,
    initialData: []
  });

  // Permutas
  const { data: barters = [] } = useQuery({
    queryKey: ['barters', selectedCompanyId],
    queryFn: () => base44.entities.Barter.filter({ company_id: selectedCompanyId }, '-date', 500),
    enabled: !!selectedCompanyId,
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-d'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });
  const company = companies.find(c => c.id === selectedCompanyId);

  // Apenas carregamentos de venda concluídos com peso líquido
  const deliveries = useMemo(
    () => weighings.filter(w => w.purpose === 'saida_venda' && w.net_tons > 0),
    [weighings]
  );

  // Agrupar por cliente
  const byClient = useMemo(() => {
    const map = {};
    deliveries.forEach(w => {
      const name = w.client_name || 'Sem cliente';
      if (!map[name]) map[name] = { name, tons: 0, count: 0, last: '' };
      map[name].tons += w.net_tons || 0;
      map[name].count += 1;
      const d = w.gross_datetime || w.tare_datetime || '';
      if (d && d > map[name].last) map[name].last = d;
    });
    return Object.values(map).sort((a, b) => b.tons - a.tons);
  }, [deliveries]);

  const totals = useMemo(() => ({
    tons: deliveries.reduce((s, w) => s + (w.net_tons || 0), 0),
    clients: byClient.length,
    carregamentos: deliveries.length
  }), [deliveries, byClient]);

  const recent = useMemo(() => deliveries.slice(0, 12), [deliveries]);

  // Totais de permutas
  const barterTotals = useMemo(() => {
    let limestone = 0, corn = 0, limestoneValue = 0, cornValue = 0, open = 0;
    barters.forEach(b => {
      limestone += b.limestone_tons || 0;
      corn += b.corn_tons || 0;
      limestoneValue += (b.limestone_tons || 0) * (b.limestone_unit_value || 0);
      cornValue += (b.corn_tons || 0) * (b.corn_unit_value || 0);
      if (b.status === 'aberto') open += 1;
    });
    return { limestone, corn, limestoneValue, cornValue, balance: limestoneValue - cornValue, open };
  }, [barters]);

  const filteredBarters = useMemo(
    () => barters.filter(b => (b.client_name || '').toLowerCase().includes(barterSearch.toLowerCase())),
    [barters, barterSearch]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['barters'] });
    queryClient.invalidateQueries({ queryKey: ['weighings-deliveries'] });
  };

  const statusBadge = (s) => {
    const map = {
      aberto: "bg-amber-50 text-amber-700 border-amber-200",
      parcial: "bg-blue-50 text-blue-700 border-blue-200",
      compensado: "bg-green-50 text-green-700 border-green-200"
    };
    return <Badge variant="outline" className={map[s] || map.aberto}>{s}</Badge>;
  };

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <TruckIcon className="w-8 h-8 text-violet-600" />
            Saídas e Permutas
          </h1>
          <p className="text-slate-500 mt-1">
            {company?.name || 'Filial'} • Entregas por cliente e troca de calcário por milho
          </p>
        </div>
        <Button onClick={() => setBarterOpen(true)} className="bg-amber-600 hover:bg-amber-700">
          <Plus className="w-4 h-4 mr-2" />
          Nova Permuta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-violet-100">Total Entregue</span>
              <Package className="w-5 h-5 text-violet-200" />
            </div>
            <div className="text-2xl font-bold">{totals.tons.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t</div>
            <div className="text-xs text-violet-200 mt-1">{totals.carregamentos} carregamento(s)</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">Clientes Ativos</span>
              <Users className="w-5 h-5 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totals.clients}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-blue-100">Calcário em Permuta</span>
              <Scale className="w-5 h-5 text-blue-200" />
            </div>
            <div className="text-2xl font-bold">{barterTotals.limestone.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t</div>
            <div className="text-xs text-blue-200 mt-1">{formatBRL(barterTotals.limestoneValue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-amber-100">Milho Recebido</span>
              <Wheat className="w-5 h-5 text-amber-200" />
            </div>
            <div className="text-2xl font-bold">{barterTotals.corn.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t</div>
            <div className="text-xs text-amber-200 mt-1">{formatBRL(barterTotals.cornValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Entregas por Cliente */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-600" />
            Entregas por Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byClient.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum carregamento de venda registrado nesta filial.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2 px-3">Cliente</th>
                    <th className="py-2 px-3 text-right">Toneladas</th>
                    <th className="py-2 px-3 text-center">Carregamentos</th>
                    <th className="py-2 px-3">Último carregamento</th>
                  </tr>
                </thead>
                <tbody>
                  {byClient.map(c => (
                    <tr key={c.name} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-900">{c.name}</td>
                      <td className="py-3 px-3 text-right font-bold text-violet-700">
                        {c.tons.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500">{c.count}</td>
                      <td className="py-3 px-3 text-slate-600">{c.last ? formatDateTime(c.last) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-slate-50">
                    <td className="py-3 px-3">TOTAL</td>
                    <td className="py-3 px-3 text-right text-violet-700">
                      {totals.tons.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t
                    </td>
                    <td className="py-3 px-3 text-center">{totals.carregamentos}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Carregamentos recentes */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TruckIcon className="w-5 h-5 text-violet-600" />
            Carregamentos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-center py-8 text-slate-500">Nenhum carregamento recente.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Cliente</th>
                    <th className="py-2 px-3">Produto</th>
                    <th className="py-2 px-3">Placa</th>
                    <th className="py-2 px-3 text-right">Peso Líq.</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(w => (
                    <tr key={w.id} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-600">{w.gross_datetime ? formatDateTime(w.gross_datetime) : '-'}</td>
                      <td className="py-2 px-3 font-medium">{w.client_name || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{w.product || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{w.vehicle_plate || '-'}</td>
                      <td className="py-2 px-3 text-right font-bold text-violet-700">
                        {(w.net_tons || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permutas (Calcário × Milho) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-amber-600" />
              Permutas (Calcário × Milho)
            </CardTitle>
            <Input placeholder="Buscar cliente..." value={barterSearch}
              onChange={e => setBarterSearch(e.target.value)} className="md:w-64" />
          </div>
        </CardHeader>
        <CardContent>
          {barters.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Wheat className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma permuta registrada.</p>
              <p className="text-xs mt-1">Use "Nova Permuta" para registrar uma troca de calcário por milho.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs text-blue-600 font-medium">Calcário entregue</div>
                  <div className="text-lg font-bold text-blue-900">
                    {barterTotals.limestone.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t
                  </div>
                  <div className="text-xs text-blue-600">{formatBRL(barterTotals.limestoneValue)}</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="text-xs text-amber-600 font-medium">Milho recebido</div>
                  <div className="text-lg font-bold text-amber-900">
                    {barterTotals.corn.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t
                  </div>
                  <div className="text-xs text-amber-600">{formatBRL(barterTotals.cornValue)}</div>
                </div>
                <div className={`p-3 rounded-lg border ${barterTotals.balance >= 0 ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="text-xs text-slate-600 font-medium">Saldo (a compensar)</div>
                  <div className={`text-lg font-bold ${barterTotals.balance >= 0 ? 'text-slate-900' : 'text-amber-700'}`}>
                    {formatBRL(barterTotals.balance)}
                  </div>
                  <div className="text-xs text-slate-500">{barterTotals.open} aberta(s)</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-600">
                      <th className="py-2 px-3">Referência</th>
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3">Cliente</th>
                      <th className="py-2 px-3">Venda</th>
                      <th className="py-2 px-3 text-right">Calcário (t)</th>
                      <th className="py-2 px-3 text-right">Milho (t)</th>
                      <th className="py-2 px-3 text-right">Saldo</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBarters.map(b => {
                      const ls = (b.limestone_tons || 0) * (b.limestone_unit_value || 0);
                      const cn = (b.corn_tons || 0) * (b.corn_unit_value || 0);
                      const bal = ls - cn;
                      return (
                        <tr key={b.id} className="border-b hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-xs text-slate-500">{b.reference}</td>
                          <td className="py-2 px-3 text-slate-600">{formatDate(b.date)}</td>
                          <td className="py-2 px-3 font-medium">{b.client_name}</td>
                          <td className="py-2 px-3 text-slate-600 text-xs">{b.sale_reference || '-'}</td>
                          <td className="py-2 px-3 text-right text-blue-700 font-medium">
                            {(b.limestone_tons || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-700 font-medium">
                            {(b.corn_tons || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${bal >= 0 ? 'text-slate-700' : 'text-amber-700'}`}>
                            {formatBRL(bal)}
                          </td>
                          <td className="py-2 px-3 text-center">{statusBadge(b.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <BarterDialog
        open={barterOpen}
        onOpenChange={setBarterOpen}
        companyId={selectedCompanyId}
        onSaved={refresh}
      />
    </div>
  );
}