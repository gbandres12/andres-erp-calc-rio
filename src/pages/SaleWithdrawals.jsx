import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PackageCheck,
  TruckIcon,
  Search,
  Calendar,
  User,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock
} from "lucide-react";
import { format } from "date-fns";

export default function SaleWithdrawals() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [searchTerm, setSearchTerm] = useState("");

  // Buscar vendas para calcular totais e pendências
  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({
      company_id: selectedCompanyId,
      status: { $in: ['faturada', 'concluida'] } // Apenas vendas efetivadas
    }, '-sale_date'),
    initialData: []
  });

  // Buscar histórico de retiradas
  const { data: withdrawals = [] } = useQuery({
    queryKey: ['withdrawals', selectedCompanyId],
    queryFn: () => base44.entities.SaleWithdrawal.filter({
      company_id: selectedCompanyId
    }, '-withdrawal_date'),
    initialData: []
  });

  // Cálculos Gerais
  const stats = useMemo(() => {
    let totalSold = 0;
    let totalWithdrawn = 0;

    // Iterar sobre vendas para somar itens
    sales.forEach(sale => {
      sale.items?.forEach(item => {
        totalSold += item.quantity || 0;
        totalWithdrawn += item.quantity_withdrawn || 0;
      });
    });

    const totalPending = totalSold - totalWithdrawn;
    const progress = totalSold > 0 ? (totalWithdrawn / totalSold) * 100 : 0;

    return { totalSold, totalWithdrawn, totalPending, progress };
  }, [sales]);

  // Agrupar pendências por Cliente
  const clientPendingData = useMemo(() => {
    const clients = {};

    sales.forEach(sale => {
      const clientId = sale.client_id;
      const clientName = sale.client_name || "Cliente Desconhecido";

      if (!clients[clientId]) {
        clients[clientId] = {
          id: clientId,
          name: clientName,
          sales: [],
          totalSold: 0,
          totalWithdrawn: 0,
          totalPending: 0
        };
      }

      // Verificar itens pendentes nesta venda
      const pendingItems = sale.items?.filter(item => (item.quantity - (item.quantity_withdrawn || 0)) > 0.001) || [];
      
      if (pendingItems.length > 0) {
        clients[clientId].sales.push({
          ...sale,
          pendingItems
        });
      }

      sale.items?.forEach(item => {
        clients[clientId].totalSold += item.quantity || 0;
        clients[clientId].totalWithdrawn += item.quantity_withdrawn || 0;
        clients[clientId].totalPending += (item.quantity - (item.quantity_withdrawn || 0));
      });
    });

    // Retornar apenas clientes com pendências ou filtrar por busca
    return Object.values(clients)
      .filter(c => c.totalPending > 0.001) // Apenas com saldo pendente
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.totalPending - a.totalPending);
  }, [sales, searchTerm]);

  // Histórico filtrado
  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter(w => 
      w.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.vehicle_plate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.responsible?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [withdrawals, searchTerm]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Saídas e Retiradas</h1>
          <p className="text-slate-500 mt-1">Controle de entregas de pedidos</p>
        </div>
      </div>

      {/* KPI Cards Geral */}
      <Card className="bg-white shadow-md border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-indigo-600" />
            Cálculo Geral de Entregas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visualização Gráfica Simplificada (Barra de Progresso) */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium text-slate-600">
              <span>Progresso das Entregas</span>
              <span>{stats.progress.toFixed(1)}%</span>
            </div>
            <Progress value={stats.progress} className="h-4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col p-4 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-sm font-medium text-blue-600 mb-1">Total Vendido</span>
              <span className="text-2xl font-bold text-blue-900">
                {stats.totalSold.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-blue-400 mt-1">Todas as unidades</span>
            </div>

            <div className="flex flex-col p-4 bg-green-50 rounded-xl border border-green-100">
              <span className="text-sm font-medium text-green-600 mb-1">Total Entregue</span>
              <span className="text-2xl font-bold text-green-900">
                {stats.totalWithdrawn.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-green-400 mt-1">Já retirado</span>
            </div>

            <div className="flex flex-col p-4 bg-red-50 rounded-xl border border-red-100">
              <span className="text-sm font-medium text-red-600 mb-1">Saldo Pendente</span>
              <span className="text-2xl font-bold text-red-900">
                {stats.totalPending.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-red-400 mt-1">A retirar</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo Principal */}
      <Tabs defaultValue="clients" className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <TabsList>
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Saldo por Cliente
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Histórico de Saídas
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Buscar cliente, produto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Aba: Por Cliente */}
        <TabsContent value="clients" className="space-y-4">
          {clientPendingData.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-lg font-medium text-slate-900">Tudo em dia!</h3>
              <p className="text-slate-500">Não há saldos pendentes de retirada para os filtros atuais.</p>
            </div>
          ) : (
            clientPendingData.map((client) => (
              <Card key={client.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="bg-slate-50 p-4 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">{client.name}</h3>
                      <div className="flex gap-3 text-sm text-slate-500">
                        <span>Vendido: {client.totalSold.toLocaleString('pt-BR')}</span>
                        <span>•</span>
                        <span>Entregue: {client.totalWithdrawn.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-medium text-slate-500">Saldo a Retirar</span>
                    <span className="text-2xl font-bold text-red-600">
                      {client.totalPending.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead>Venda / Data</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd. Vendida</TableHead>
                        <TableHead className="text-right">Qtd. Entregue</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.sales.map((sale) => (
                        sale.pendingItems.map((item, idx) => (
                          <TableRow key={`${sale.id}-${idx}`}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-900">{sale.reference}</span>
                                <span className="text-xs text-slate-500">
                                  {sale.sale_date ? format(new Date(sale.sale_date), 'dd/MM/yyyy') : '-'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{item.product_name}</span>
                            </TableCell>
                            <TableCell className="text-right text-slate-600">
                              {item.quantity} {item.unit}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              {item.quantity_withdrawn || 0} {item.unit}
                            </TableCell>
                            <TableCell className="text-right font-bold text-red-600 bg-red-50/30">
                              {(item.quantity - (item.quantity_withdrawn || 0)).toFixed(2)} {item.unit}
                            </TableCell>
                          </TableRow>
                        ))
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Aba: Histórico */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Últimas Retiradas Realizadas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Veículo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWithdrawals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        Nenhum registro encontrado no histórico.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWithdrawals.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {w.withdrawal_date ? format(new Date(w.withdrawal_date), 'dd/MM/yyyy HH:mm') : '-'}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{w.product_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {w.quantity} {w.unit}
                          </Badge>
                        </TableCell>
                        <TableCell>{w.responsible || '-'}</TableCell>
                        <TableCell>
                          {w.vehicle_plate ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <TruckIcon className="w-3 h-3" />
                              {w.vehicle_plate}
                            </div>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}