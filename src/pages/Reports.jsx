import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Package, TruckIcon, DollarSign, ShoppingCart, Fuel, Scale, Users, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

export default function Reports() {
  const [selectedCompanyId] = React.useState(localStorage.getItem('selectedCompanyId'));

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
    initialData: []
  });

  const { data: stockEntries = [] } = useQuery({
    queryKey: ['stockEntries', selectedCompanyId],
    queryFn: () => base44.entities.StockEntry.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.list('-created_date', 100),
    initialData: []
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedCompanyId],
    queryFn: () => base44.entities.Vehicle.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', selectedCompanyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', selectedCompanyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: refuelings = [] } = useQuery({
    queryKey: ['refuelings', selectedCompanyId],
    queryFn: () => base44.entities.Refueling.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: weighings = [] } = useQuery({
    queryKey: ['weighings', selectedCompanyId],
    queryFn: () => base44.entities.Weighing.filter({ company_id: selectedCompanyId }),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.filter({ is_active: true }),
    initialData: []
  });

  // Cálculos
  const totalStockValue = stockEntries.reduce((sum, e) => sum + (e.quantity_available * e.unit_cost || 0), 0);
  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalRevenues = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.amount, 0);
  const totalFuelCost = refuelings.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const totalWeight = weighings.reduce((sum, w) => sum + (w.net || 0), 0);
  const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock && p.min_stock > 0);

  // Vendas por mês (últimos 6 meses)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - i));
    return {
      month: date.toLocaleDateString('pt-BR', { month: 'short' }),
      value: 0
    };
  });

  sales.forEach(sale => {
    const saleDate = new Date(sale.sale_date);
    const monthDiff = (new Date().getFullYear() - saleDate.getFullYear()) * 12 + new Date().getMonth() - saleDate.getMonth();
    if (monthDiff >= 0 && monthDiff < 6) {
      last6Months[5 - monthDiff].value += sale.total || 0;
    }
  });

  // Distribuição de veículos por tipo
  const vehiclesByType = vehicles.reduce((acc, v) => {
    const type = v.fleet_type || 'propria';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const vehicleData = [
    { name: 'Própria', value: vehiclesByType.propria || 0 },
    { name: 'Agregada', value: vehiclesByType.agregada || 0 }
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Relatórios Gerenciais</h1>
        <p className="text-slate-500 mt-1">Análises e dashboards completos</p>
      </div>

      {/* KPIs Principais */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-100">Total Produtos</CardTitle>
            <Package className="h-5 w-5 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{products.length}</div>
            <p className="text-xs text-blue-200 mt-1">ativos no sistema</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-100">Valor em Estoque</CardTitle>
            <DollarSign className="h-5 w-5 text-green-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-green-200 mt-1">valor total inventário</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-purple-100">Total Vendas</CardTitle>
            <ShoppingCart className="h-5 w-5 text-purple-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              R$ {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-purple-200 mt-1">{sales.length} pedidos</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-100">Alertas</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-200" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{lowStockProducts.length}</div>
            <p className="text-xs text-orange-200 mt-1">produtos com estoque baixo</p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo Financeiro */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Resumo Financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Receitas</p>
              <p className="text-2xl font-bold text-green-600">
                R$ {totalRevenues.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Despesas</p>
              <p className="text-2xl font-bold text-red-600">
                R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`p-4 rounded-lg ${totalRevenues - totalExpenses >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
              <p className="text-sm text-slate-600 mb-1">Saldo</p>
              <p className={`text-2xl font-bold ${totalRevenues - totalExpenses >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                R$ {(totalRevenues - totalExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Vendas (Últimos 6 Meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={last6Months}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
                <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Frota</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={vehicleData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {vehicleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas Operacionais */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Veículos</CardTitle>
            <TruckIcon className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vehicles.length}</div>
            <p className="text-xs text-slate-500">na frota</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transferências</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transfers.length}</div>
            <p className="text-xs text-slate-500">entre filiais</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Combustível</CardTitle>
            <Fuel className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalFuelCost.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500">custo total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts.length}</div>
            <p className="text-xs text-slate-500">cadastrados</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}