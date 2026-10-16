import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Plus, Printer, Ruler } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WeighingTicket from "@/components/weighing/WeighingTicket";
import WeighingFormDialog from "@/components/weighing/WeighingFormDialog";

export default function Weighing() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [printWeighing, setPrintWeighing] = useState(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: weighings = [] } = useQuery({
    queryKey: ['weighings', selectedCompanyId],
    queryFn: () => base44.entities.Weighing.filter({ 
      company_id: selectedCompanyId
    }, '-created_date'),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true, type: 'cliente' }),
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });
  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: selectedCompanyId, status: { $in: ['concluida', 'faturada'] } }, '-created_date', 50),
    initialData: []
  });

  const { data: receivableSales = [] } = useQuery({
    queryKey: ['receivableSales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: selectedCompanyId, remaining_amount: { $gt: 0 } }),
    initialData: []
  });

  // Cálculos de saldo de estoque (entradas - saídas) — espelha planilha de calcário
  const totalEntradas = weighings.filter(w => w.purpose === 'entrada_estoque').reduce((sum, w) => sum + (w.net || 0), 0);
  const totalSaidas = weighings.filter(w => w.purpose === 'saida_venda').reduce((sum, w) => sum + (w.net || 0), 0);
  const saldoEstoque = totalEntradas - totalSaidas;

  // Resumo por cliente (saídas de calcário)
  const clientDeliveries = {};
  weighings.filter(w => w.purpose === 'saida_venda').forEach(w => {
    const name = w.client_name || 'Sem cliente';
    if (!clientDeliveries[name]) clientDeliveries[name] = { name, totalKg: 0, count: 0, lastDate: null };
    clientDeliveries[name].totalKg += (w.net || 0);
    clientDeliveries[name].count += 1;
    const wDate = w.gross_datetime || w.created_date;
    if (!clientDeliveries[name].lastDate || (wDate && wDate > clientDeliveries[name].lastDate)) {
      clientDeliveries[name].lastDate = wDate;
    }
  });

  // Dívidas por cliente (vendas com remaining > 0)
  const clientDebts = {};
  receivableSales.forEach(s => {
    const name = s.client_name || 'Sem cliente';
    clientDebts[name] = (clientDebts[name] || 0) + (s.remaining_amount || 0);
  });

  const clientSummary = Object.values(clientDeliveries)
    .map(c => ({ ...c, debt: clientDebts[c.name] || 0 }))
    .sort((a, b) => b.totalKg - a.totalKg);

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchaseOrdersWeighing', selectedCompanyId],
    queryFn: () => base44.entities.PurchaseOrder.filter({ company_id: selectedCompanyId, status: { $in: ['pendente', 'aprovado'] } }, '-created_date'),
    initialData: []
  });

  const printTicket = (weighing) => {
    setPrintWeighing(weighing);
    setIsPrintDialogOpen(true);
  };

  const statusColors = {
    aguardando_tara: "bg-yellow-100 text-yellow-800",
    aguardando_bruto: "bg-blue-100 text-blue-800",
    concluida: "bg-green-100 text-green-800",
    cancelada: "bg-red-100 text-red-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sistema de Pesagem</h1>
          <p className="text-slate-500 mt-1">Controle de balança e pesagens</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Pesagem
        </Button>
        <WeighingFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          vehicles={vehicles}
          contacts={contacts}
          sales={sales}
          purchaseOrders={purchaseOrders}
          selectedCompanyId={selectedCompanyId}
          selectedCompany={selectedCompany}
        />
      </div>

      {/* KPIs - Saldo de Estoque Calcário */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Entradas (Pedras)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(totalEntradas / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</div>
            <p className="text-xs text-blue-200 mt-1">{totalEntradas.toLocaleString("pt-BR")} kg</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Saídas (Moído)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(totalSaidas / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</div>
            <p className="text-xs text-orange-200 mt-1">{totalSaidas.toLocaleString("pt-BR")} kg</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-100">Saldo Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(saldoEstoque / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</div>
            <p className="text-xs text-emerald-200 mt-1">{saldoEstoque.toLocaleString("pt-BR")} kg</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-500 to-slate-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-100">Total Pesagens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weighings.length}</div>
            <p className="text-xs text-slate-200 mt-1">{weighings.filter(w => w.status === 'concluida').length} concluídas</p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por Cliente — Saídas de Calcário */}
      {clientSummary.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Resumo por Cliente — Saídas de Calcário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="pb-2 font-semibold">Cliente</th>
                    <th className="pb-2 font-semibold text-right">Entregas</th>
                    <th className="pb-2 font-semibold text-right">Total (kg)</th>
                    <th className="pb-2 font-semibold text-right">Total (t)</th>
                    <th className="pb-2 font-semibold text-right">A Pagar</th>
                    <th className="pb-2 font-semibold">Última Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.map(c => (
                    <tr key={c.name} className="border-b hover:bg-slate-50">
                      <td className="py-2 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2 text-right text-slate-600">{c.count}</td>
                      <td className="py-2 text-right font-semibold">{c.totalKg.toLocaleString("pt-BR")}</td>
                      <td className="py-2 text-right text-slate-600">{(c.totalKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                      <td className="py-2 text-right">
                        {c.debt > 0 ? (
                          <span className="font-bold text-red-600">R$ {c.debt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-700">Quitado</Badge>
                        )}
                      </td>
                      <td className="py-2 text-slate-600">{c.lastDate ? new Date(c.lastDate).toLocaleDateString("pt-BR") : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-slate-900">
                    <td className="pt-3">Total Geral</td>
                    <td className="pt-3 text-right">{clientSummary.reduce((s, c) => s + c.count, 0)}</td>
                    <td className="pt-3 text-right">{clientSummary.reduce((s, c) => s + c.totalKg, 0).toLocaleString("pt-BR")}</td>
                    <td className="pt-3 text-right">{(clientSummary.reduce((s, c) => s + c.totalKg, 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                    <td className="pt-3 text-right text-red-600">R$ {clientSummary.reduce((s, c) => s + c.debt, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros de Data */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Label className="text-sm font-medium">Filtrar por data:</Label>
            <Input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-40" />
            <span className="text-slate-500">até</span>
            <Input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-40" />
            {(filterStart || filterEnd) && (
              <Button variant="outline" size="sm" onClick={() => { setFilterStart(""); setFilterEnd(""); }}>
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Impressão */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ticket de Pesagem</DialogTitle>
          </DialogHeader>
          <WeighingTicket
            weighing={printWeighing}
            company={selectedCompany}
            onClose={() => setIsPrintDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Lista de Pesagens */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pesagens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {weighings.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Scale className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma pesagem registrada ainda</p>
              </div>
            ) : (
              weighings.filter(w => {
                if (filterStart && w.created_date < filterStart) return false;
                if (filterEnd && w.created_date > filterEnd + "T23:59:59") return false;
                return true;
              }).map((weighing) => (
                <div key={weighing.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Scale className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{weighing.reference}</p>
                        <Badge className={statusColors[weighing.status]}>
                          {weighing.status}
                        </Badge>
                        <Badge variant="outline" className="ml-2">
                          {weighing.purpose === 'entrada_estoque' ? 'Entrada' : 'Saída'}
                        </Badge>
                        {weighing.ticket_number && (
                            <Badge variant="secondary" className="ml-2 bg-slate-100 text-slate-600">
                                🎫 {weighing.ticket_number}
                            </Badge>
                        )}
                        {weighing.sale_id && (
                            <Badge variant="outline" className="ml-2 border-blue-200 text-blue-700">
                                🛒 Venda Vinculada
                            </Badge>
                        )}
                        {weighing.barge_name && (
                            <Badge variant="outline" className="ml-2 border-cyan-200 text-cyan-700">
                                🚢 {weighing.barge_name}
                            </Badge>
                        )}
                        {weighing.weight_source === 'cubagem' && (
                            <Badge variant="outline" className="ml-2 border-violet-200 text-violet-700">
                                📐 Cubagem
                            </Badge>
                        )}
                        {weighing.cubage_alert && (
                            <Badge variant="outline" className="ml-2 border-red-200 text-red-700">
                                ⚠ Divergência
                            </Badge>
                        )}
                        {weighing.purchase_order_id && (
                            <Badge variant="outline" className="ml-2 border-purple-200 text-purple-700">
                                📋 OC Vinculada
                            </Badge>
                        )}
                        {weighing.barter_id && (
                            <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">
                                🌽 Permuta
                            </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {weighing.vehicle_plate} • {weighing.driver_name ? `${weighing.driver_name} • ` : ''} {weighing.product}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {weighing.origin} → {weighing.destination} • Operador: {weighing.operator}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-4 mb-2">
                      <div>
                        <p className="text-xs text-slate-500">Tara</p>
                        <p className="font-semibold">{((weighing.tare || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Bruto</p>
                        <p className="font-semibold">{((weighing.gross || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Líquido</p>
                        <p className="text-lg font-bold text-blue-600">
                            {((weighing.net || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-violet-300 text-violet-700 hover:bg-violet-50"
                        onClick={() => navigate(`/Cubage?weighing_id=${weighing.id}`)}
                      >
                        <Ruler className="w-4 h-4 mr-2" />
                        Cubagem
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => printTicket(weighing)}
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimir
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}