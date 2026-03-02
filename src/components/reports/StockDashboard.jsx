import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area
} from "recharts";
import {
  Package, ArrowDownToLine, ArrowUpFromLine, Ship, TruckIcon,
  Users, CheckCircle2, Clock, AlertCircle, Search
} from "lucide-react";
import { formatDate, getTodayDate } from "@/components/utils/formatters";

export default function StockDashboard({ companies = [] }) {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [filterCompanyId, setFilterCompanyId] = useState(localStorage.getItem('selectedCompanyId') || 'all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(getTodayDate());
  const [searchTerm, setSearchTerm] = useState("");

  const companyFilter = useMemo(() =>
    filterCompanyId === 'all' ? {} : { company_id: filterCompanyId },
    [filterCompanyId]
  );

  const { data: stockEntries = [] } = useQuery({
    queryKey: ['stockEntries-all'],
    queryFn: () => base44.entities.StockEntry.filter({}),
    initialData: []
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['withdrawals-all'],
    queryFn: () => base44.entities.SaleWithdrawal.filter({}),
    initialData: []
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales-all'],
    queryFn: () => base44.entities.Sale.filter({}),
    initialData: []
  });

  const { data: weighings = [] } = useQuery({
    queryKey: ['weighings-all'],
    queryFn: () => base44.entities.Weighing.filter({}),
    initialData: []
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  // Filtrar por empresa e período
  const filteredEntries = useMemo(() => {
    return stockEntries.filter(e => {
      const matchCompany = filterCompanyId === 'all' || e.company_id === filterCompanyId;
      const entryDate = (e.created_date || '').split('T')[0];
      const matchDate = entryDate >= startDate && entryDate <= endDate;
      return matchCompany && matchDate;
    });
  }, [stockEntries, filterCompanyId, startDate, endDate]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter(w => {
      const matchCompany = filterCompanyId === 'all' || w.company_id === filterCompanyId;
      const wDate = (w.withdrawal_date || w.created_date || '').split('T')[0];
      const matchDate = wDate >= startDate && wDate <= endDate;
      return matchCompany && matchDate;
    });
  }, [withdrawals, filterCompanyId, startDate, endDate]);

  // Balsas (pesagens com barge_name preenchido)
  const bargeWeighings = useMemo(() => {
    return weighings.filter(w => w.barge_name && w.barge_name.trim() !== '');
  }, [weighings]);

  // Movimentação diária (entradas + saídas por dia)
  const dailyMovement = useMemo(() => {
    const days = {};
    filteredEntries.forEach(e => {
      const day = (e.created_date || '').split('T')[0];
      if (!day) return;
      if (!days[day]) days[day] = { date: day, entrada: 0, saida: 0 };
      days[day].entrada += e.quantity_received || 0;
    });
    filteredWithdrawals.forEach(w => {
      const day = (w.withdrawal_date || w.created_date || '').split('T')[0];
      if (!day) return;
      if (!days[day]) days[day] = { date: day, entrada: 0, saida: 0 };
      days[day].saida += w.quantity || 0;
    });
    return Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, label: d.date.split('-').slice(1).reverse().join('/') }));
  }, [filteredEntries, filteredWithdrawals]);

  // Entradas por setor
  const entriesBySector = useMemo(() => {
    const sectors = {};
    filteredEntries.forEach(e => {
      const s = e.sector || 'outros';
      sectors[s] = (sectors[s] || 0) + (e.quantity_received || 0);
    });
    return Object.entries(sectors).map(([name, value]) => ({ name, value }));
  }, [filteredEntries]);

  // Balsas por destino (usando company_id da entrada ou destination da pesagem)
  const bargesByDestination = useMemo(() => {
    const dest = {};
    bargeWeighings.forEach(w => {
      const d = w.destination || 'Não especificado';
      if (!dest[d]) dest[d] = { destination: d, count: 0, totalTons: 0, barge_names: new Set() };
      dest[d].count += 1;
      dest[d].totalTons += w.net_tons || (w.net || 0) / 1000;
      dest[d].barge_names.add(w.barge_name);
    });
    return Object.values(dest).map(d => ({
      ...d,
      barge_names: Array.from(d.barge_names),
      totalTons: parseFloat(d.totalTons.toFixed(2))
    }));
  }, [bargeWeighings]);

  // Clientes entregues vs pendentes
  const clientsDeliveryStatus = useMemo(() => {
    const clients = {};
    sales.filter(s => ['faturada', 'concluida'].includes(s.status)).forEach(sale => {
      const cId = sale.client_id;
      const cName = sale.client_name || 'Desconhecido';
      if (!clients[cId]) clients[cId] = { id: cId, name: cName, totalSold: 0, totalDelivered: 0 };
      sale.items?.forEach(item => {
        clients[cId].totalSold += item.quantity || 0;
        clients[cId].totalDelivered += item.quantity_withdrawn || 0;
      });
    });
    return Object.values(clients)
      .map(c => ({
        ...c,
        totalPending: Math.max(0, c.totalSold - c.totalDelivered),
        progress: c.totalSold > 0 ? Math.min(100, (c.totalDelivered / c.totalSold) * 100) : 0,
        status: c.totalSold <= 0 ? 'sem_venda'
          : c.totalDelivered >= c.totalSold ? 'entregue'
          : c.totalDelivered > 0 ? 'parcial'
          : 'pendente'
      }))
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.totalPending - a.totalPending);
  }, [sales, searchTerm]);

  // KPIs gerais
  const totalEntradas = filteredEntries.reduce((s, e) => s + (e.quantity_received || 0), 0);
  const totalSaidas = filteredWithdrawals.reduce((s, w) => s + (w.quantity || 0), 0);
  const totalBalsas = new Set(bargeWeighings.map(w => w.barge_name)).size;
  const clientesPendentes = clientsDeliveryStatus.filter(c => c.status === 'pendente' || c.status === 'parcial').length;

  const statusColors = {
    entregue: 'bg-green-100 text-green-700 border-green-200',
    parcial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    pendente: 'bg-red-100 text-red-700 border-red-200',
    sem_venda: 'bg-slate-100 text-slate-500 border-slate-200'
  };

  const statusLabels = {
    entregue: 'Entregue',
    parcial: 'Parcial',
    pendente: 'Pendente',
    sem_venda: 'Sem venda'
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label>Data Inicial</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white w-[160px]" />
          </div>
          <div className="space-y-1">
            <Label>Data Final</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white w-[160px]" />
          </div>
          <div className="space-y-1">
            <Label>Filial</Label>
            <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Filiais</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-100 flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4" /> Total Entradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEntradas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-blue-200 mt-1">{filteredEntries.length} registros</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-100 flex items-center gap-2">
              <ArrowUpFromLine className="w-4 h-4" /> Total Saídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSaidas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-red-200 mt-1">{filteredWithdrawals.length} retiradas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-indigo-100 flex items-center gap-2">
              <Ship className="w-4 h-4" /> Balsas Registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBalsas}</div>
            <p className="text-xs text-indigo-200 mt-1">{bargeWeighings.length} pesagens</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Clientes Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientesPendentes}</div>
            <p className="text-xs text-orange-200 mt-1">com saldo a entregar</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="daily">📅 Movimentação Diária</TabsTrigger>
          <TabsTrigger value="barges">🚢 Balsas</TabsTrigger>
          <TabsTrigger value="clients">👥 Clientes</TabsTrigger>
          <TabsTrigger value="entries">📦 Entradas Detalhadas</TabsTrigger>
          <TabsTrigger value="exits">📤 Saídas Detalhadas</TabsTrigger>
        </TabsList>

        {/* Movimentação Diária */}
        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Entradas x Saídas por Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyMovement.length === 0 ? (
                <div className="text-center py-10 text-slate-400">Nenhuma movimentação no período selecionado.</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dailyMovement}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
                    <Legend />
                    <Bar dataKey="entrada" name="Entrada" fill="#3B82F6" radius={[3,3,0,0]} />
                    <Bar dataKey="saida" name="Saída" fill="#EF4444" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Entradas por Setor</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={entriesBySector} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip formatter={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
                    <Bar dataKey="value" name="Qtd" fill="#10B981" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Resumo do Período</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-blue-700">Total Entrado</span>
                  <span className="text-lg font-bold text-blue-900">{totalEntradas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium text-red-700">Total Saído</span>
                  <span className="text-lg font-bold text-red-900">{totalSaidas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className={`flex justify-between items-center p-3 rounded-lg ${(totalEntradas - totalSaidas) >= 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
                  <span className={`text-sm font-medium ${(totalEntradas - totalSaidas) >= 0 ? 'text-green-700' : 'text-orange-700'}`}>Saldo</span>
                  <span className={`text-lg font-bold ${(totalEntradas - totalSaidas) >= 0 ? 'text-green-900' : 'text-orange-900'}`}>
                    {(totalEntradas - totalSaidas).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Balsas */}
        <TabsContent value="barges" className="space-y-4">
          {/* Por destino */}
          {bargesByDestination.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {bargesByDestination.map((dest) => (
                <Card key={dest.destination} className="border-indigo-200">
                  <CardHeader className="bg-indigo-50 rounded-t-lg pb-3">
                    <CardTitle className="flex items-center gap-2 text-indigo-800">
                      <Ship className="w-5 h-5" />
                      Destino: {dest.destination}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Pesagens</span>
                      <span className="font-bold">{dest.count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Total Toneladas</span>
                      <span className="font-bold text-indigo-700">{dest.totalTons.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Balsas</span>
                      <span className="font-bold">{dest.barge_names.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {dest.barge_names.map(b => (
                        <Badge key={b} variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{b}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Tabela detalhada de pesagens de balsas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="w-5 h-5 text-indigo-600" />
                Histórico de Pesagens por Balsa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bargeWeighings.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Ship className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  Nenhuma pesagem de balsa encontrada.<br/>
                  <span className="text-xs">Registre pesagens com o campo "Nome da Balsa" preenchido.</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referência</TableHead>
                      <TableHead>Balsa</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Peso Líquido</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bargeWeighings.map(w => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.reference}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700">{w.barge_name}</Badge>
                        </TableCell>
                        <TableCell>{w.product || '-'}</TableCell>
                        <TableCell>{w.destination || '-'}</TableCell>
                        <TableCell>{w.origin || '-'}</TableCell>
                        <TableCell className="text-right font-medium">
                          {w.net_tons ? `${w.net_tons.toFixed(3)} t` : w.net ? `${(w.net/1000).toFixed(3)} t` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            w.status === 'concluida' ? 'bg-green-100 text-green-700' :
                            w.status === 'cancelada' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }>{w.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDate(w.created_date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-3 text-sm">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Entregue: {clientsDeliveryStatus.filter(c => c.status === 'entregue').length}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Parcial: {clientsDeliveryStatus.filter(c => c.status === 'parcial').length}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Pendente: {clientsDeliveryStatus.filter(c => c.status === 'pendente').length}</span>
            </div>
          </div>

          {clientsDeliveryStatus.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Nenhum cliente encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {clientsDeliveryStatus.map(client => (
                <Card key={client.id} className={`border ${client.status === 'entregue' ? 'border-green-200' : client.status === 'parcial' ? 'border-yellow-200' : 'border-red-200'}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                          client.status === 'entregue' ? 'bg-green-500' :
                          client.status === 'parcial' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}>
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{client.name}</p>
                          <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                            <span>Vendido: {client.totalSold.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                            <span>•</span>
                            <span>Entregue: {client.totalDelivered.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                            <span>•</span>
                            <span className="font-medium text-red-600">Pendente: {client.totalPending.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Entregue</span>
                            <span className="font-medium">{client.progress.toFixed(1)}%</span>
                          </div>
                          <Progress value={client.progress} className="h-2" />
                        </div>
                        <Badge className={statusColors[client.status]}>{statusLabels[client.status]}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Entradas Detalhadas */}
        <TabsContent value="entries">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-blue-600" />
                Entradas de Estoque no Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referência</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Qtd. Recebida</TableHead>
                    <TableHead className="text-right">Qtd. Disponível</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">Nenhuma entrada no período.</TableCell></TableRow>
                  ) : filteredEntries.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                      <TableCell className="font-medium">{e.product_name}</TableCell>
                      <TableCell><Badge variant="secondary">{e.sector}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{e.origin}</Badge></TableCell>
                      <TableCell className="text-slate-500">{e.supplier || '-'}</TableCell>
                      <TableCell className="text-right font-medium text-blue-700">{e.quantity_received?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{e.quantity_available?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDate(e.created_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Saídas Detalhadas */}
        <TabsContent value="exits">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5 text-red-600" />
                Saídas (Retiradas) no Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venda</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWithdrawals.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Nenhuma saída no período.</TableCell></TableRow>
                  ) : filteredWithdrawals.map(w => {
                    const sale = sales.find(s => s.id === w.sale_id);
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.sale_reference || '-'}</TableCell>
                        <TableCell className="font-medium">{w.product_name}</TableCell>
                        <TableCell>{sale?.client_name || '-'}</TableCell>
                        <TableCell>{w.responsible || '-'}</TableCell>
                        <TableCell>{w.vehicle_plate ? (
                          <div className="flex items-center gap-1"><TruckIcon className="w-3 h-3" />{w.vehicle_plate}</div>
                        ) : '-'}</TableCell>
                        <TableCell className="text-right font-medium text-red-700">
                          {w.quantity?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {w.unit}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {w.withdrawal_date ? new Date(w.withdrawal_date).toLocaleString('pt-BR') : formatDate(w.created_date)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}