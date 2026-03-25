import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, ShoppingCart, Calendar } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";

export default function CohortReport({ filterCompanyId }) {
  const companyFilter = useMemo(
    () => (filterCompanyId && filterCompanyId !== "all" ? { company_id: filterCompanyId } : {}),
    [filterCompanyId]
  );

  const { data: sales = [] } = useQuery({
    queryKey: ["cohort-sales", filterCompanyId],
    queryFn: () => base44.entities.Sale.filter(companyFilter),
    initialData: [],
  });

  // Build cohort data: group clients by first purchase month, track in subsequent months
  const { cohortTable, months, cohortClients } = useMemo(() => {
    if (!sales.length) return { cohortTable: [], months: [], cohortClients: [] };

    // Map client -> list of purchase months
    const clientMonths = {};
    sales.forEach((s) => {
      if (!s.client_id || !s.sale_date) return;
      const date = new Date(s.sale_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!clientMonths[s.client_id]) clientMonths[s.client_id] = { months: new Set(), name: s.client_name || s.client_id, revenue: {} };
      clientMonths[s.client_id].months.add(monthKey);
      clientMonths[s.client_id].revenue[monthKey] = (clientMonths[s.client_id].revenue[monthKey] || 0) + (s.total || 0);
    });

    // Determine all unique months sorted
    const allMonths = Array.from(
      new Set(Object.values(clientMonths).flatMap((c) => Array.from(c.months)))
    ).sort();

    // For each cohort month (first purchase), count active clients in subsequent months
    const cohortMap = {}; // cohortMonth -> { month0count, month1count, ... }
    const cohortClientsList = []; // for the detail table

    Object.entries(clientMonths).forEach(([clientId, data]) => {
      const sortedMonths = Array.from(data.months).sort();
      const firstMonth = sortedMonths[0];
      if (!cohortMap[firstMonth]) cohortMap[firstMonth] = { clients: 0, retention: {} };
      cohortMap[firstMonth].clients++;

      sortedMonths.forEach((m) => {
        const offset = allMonths.indexOf(m) - allMonths.indexOf(firstMonth);
        if (!cohortMap[firstMonth].retention[offset]) cohortMap[firstMonth].retention[offset] = 0;
        cohortMap[firstMonth].retention[offset]++;
      });
    });

    const cohortRows = Object.entries(cohortMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const maxOffset = Math.max(...Object.keys(data.retention).map(Number));
        const cells = [];
        for (let i = 0; i <= Math.min(maxOffset, 11); i++) {
          const count = data.retention[i] || 0;
          const pct = data.clients > 0 ? Math.round((count / data.clients) * 100) : 0;
          cells.push({ count, pct });
        }
        return { month, clients: data.clients, cells };
      });

    // Top clients summary
    const topClients = Object.entries(clientMonths)
      .map(([id, d]) => ({
        id,
        name: d.name,
        purchases: d.months.size,
        totalRevenue: Object.values(d.revenue).reduce((a, b) => a + b, 0),
        firstMonth: Array.from(d.months).sort()[0],
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    return { cohortTable: cohortRows, months: allMonths, cohortClients: topClients };
  }, [sales]);

  const formatMonth = (key) => {
    if (!key) return "";
    const [y, m] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  };

  const getColor = (pct) => {
    if (pct === 100) return "bg-purple-600 text-white";
    if (pct >= 75) return "bg-purple-400 text-white";
    if (pct >= 50) return "bg-purple-300 text-purple-900";
    if (pct >= 25) return "bg-purple-100 text-purple-800";
    if (pct > 0) return "bg-purple-50 text-purple-700";
    return "bg-slate-50 text-slate-400";
  };

  const totalClients = useMemo(() => new Set(sales.map((s) => s.client_id).filter(Boolean)).size, [sales]);
  const recurringClients = useMemo(
    () => cohortClients.filter((c) => c.purchases > 1).length,
    [cohortClients]
  );
  const avgPurchases = useMemo(
    () => (cohortClients.length > 0 ? (cohortClients.reduce((a, c) => a + c.purchases, 0) / cohortClients.length).toFixed(1) : 0),
    [cohortClients]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4 flex items-center gap-4">
            <Users className="w-10 h-10 opacity-80" />
            <div>
              <p className="text-purple-100 text-sm">Clientes Únicos</p>
              <p className="text-3xl font-bold">{totalClients}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4 flex items-center gap-4">
            <TrendingUp className="w-10 h-10 opacity-80" />
            <div>
              <p className="text-blue-100 text-sm">Clientes Recorrentes</p>
              <p className="text-3xl font-bold">{recurringClients}</p>
              <p className="text-xs text-blue-200">
                {totalClients > 0 ? Math.round((recurringClients / totalClients) * 100) : 0}% de retenção
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4 flex items-center gap-4">
            <ShoppingCart className="w-10 h-10 opacity-80" />
            <div>
              <p className="text-green-100 text-sm">Compras Médias / Cliente</p>
              <p className="text-3xl font-bold">{avgPurchases}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cohort Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Análise de Coorte — Retenção de Clientes
          </CardTitle>
          <p className="text-sm text-slate-500">
            Cada linha representa os clientes que compraram pela primeira vez naquele mês. As colunas mostram quantos voltaram nos meses seguintes.
          </p>
        </CardHeader>
        <CardContent>
          {cohortTable.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Nenhum dado de vendas com cliente vinculado encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap">Coorte (1ª Compra)</th>
                    <th className="p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200">Clientes</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap">
                        M+{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortTable.map((row) => (
                    <tr key={row.month}>
                      <td className="p-2 border border-slate-200 font-medium text-slate-700 whitespace-nowrap bg-white">
                        {formatMonth(row.month)}
                      </td>
                      <td className="p-2 border border-slate-200 text-center font-bold text-slate-800 bg-white">
                        {row.clients}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const cell = row.cells[i];
                        return (
                          <td
                            key={i}
                            className={`p-2 border border-slate-200 text-center font-medium ${cell ? getColor(cell.pct) : "bg-slate-50 text-slate-300"}`}
                            title={cell ? `${cell.count} clientes (${cell.pct}%)` : "Sem dados"}
                          >
                            {cell && cell.count > 0 ? `${cell.pct}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-xs text-slate-500">Intensidade:</span>
            {[
              { label: "100%", cls: "bg-purple-600" },
              { label: "≥75%", cls: "bg-purple-400" },
              { label: "≥50%", cls: "bg-purple-300" },
              { label: "≥25%", cls: "bg-purple-100" },
              { label: "<25%", cls: "bg-purple-50 border border-purple-200" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${l.cls}`} />
                <span className="text-xs text-slate-600">{l.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Clientes — Engajamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">#</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Cliente</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">1ª Compra</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">Pedidos</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Receita Total</th>
                </tr>
              </thead>
              <tbody>
                {cohortClients.map((c, i) => (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{c.name}</td>
                    <td className="py-2 px-3 text-center text-slate-500">{formatMonth(c.firstMonth)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.purchases > 1 ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.purchases}x
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-green-700">{formatBRL(c.totalRevenue)}</td>
                  </tr>
                ))}
                {cohortClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-6">Nenhum dado encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}