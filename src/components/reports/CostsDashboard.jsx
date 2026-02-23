import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart, Line, PieChart, Pie, Cell 
} from "recharts";
import { formatBRL } from "@/components/utils/formatters";
import { ArrowUpRight, TrendingDown, Building2, AlertTriangle, PieChart as PieIcon } from "lucide-react";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export default function CostsDashboard({ transactions, companies, startDate, endDate }) {
    
    // 1. Visão Mensal (Tendências)
    const monthlyData = useMemo(() => {
        const grouped = {};
        
        // Ordenar por data
        const sorted = [...transactions].sort((a, b) => new Date(a.payment_date || a.due_date) - new Date(b.payment_date || b.due_date));

        sorted.forEach(t => {
            const date = new Date(t.payment_date || t.due_date); // Usa data de pagamento ou vencimento
            if (isNaN(date.getTime())) return;
            
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

            if (!grouped[key]) {
                grouped[key] = { name: label, receita: 0, despesa: 0, sortKey: key };
            }

            if (t.type === 'receita') {
                grouped[key].receita += (t.paid_amount || t.amount || 0);
            } else {
                grouped[key].despesa += (t.paid_amount || t.amount || 0);
            }
        });

        const data = Object.values(grouped).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        
        // Calcular relação Custo/Faturamento
        return data.map(item => ({
            ...item,
            ratio: item.receita > 0 ? (item.despesa / item.receita) * 100 : 0
        }));
    }, [transactions]);

    // 2. Distribuição por Categoria
    const categoryData = useMemo(() => {
        const grouped = {};
        const expenses = transactions.filter(t => t.type === 'despesa');

        expenses.forEach(t => {
            const cat = t.category || 'Outros';
            grouped[cat] = (grouped[cat] || 0) + (t.paid_amount || t.amount || 0);
        });

        return Object.entries(grouped)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10); // Top 10 categorias
    }, [transactions]);

    // 3. Comparação por Filial
    const companyData = useMemo(() => {
        const grouped = {};
        
        transactions.forEach(t => {
            const companyId = t.company_id;
            const companyName = companies.find(c => c.id === companyId)?.name || 'Desconhecida';
            
            if (!grouped[companyId]) {
                grouped[companyId] = { name: companyName, receita: 0, despesa: 0 };
            }

            if (t.type === 'receita') {
                grouped[companyId].receita += (t.paid_amount || t.amount || 0);
            } else {
                grouped[companyId].despesa += (t.paid_amount || t.amount || 0);
            }
        });

        return Object.values(grouped).map(item => ({
            ...item,
            lucro: item.receita - item.despesa,
            margem: item.receita > 0 ? ((item.receita - item.despesa) / item.receita) * 100 : 0
        }));
    }, [transactions, companies]);

    // Totais Gerais
    const totals = useMemo(() => {
        const receita = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + (t.paid_amount || t.amount || 0), 0);
        const despesa = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + (t.paid_amount || t.amount || 0), 0);
        return { receita, despesa, ratio: receita > 0 ? (despesa / receita) * 100 : 0 };
    }, [transactions]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{formatBRL(totals.despesa)}</div>
                        <p className="text-xs text-muted-foreground">no período selecionado</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatBRL(totals.receita)}</div>
                        <p className="text-xs text-muted-foreground">no período selecionado</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Custo / Faturamento</CardTitle>
                        <AlertTriangle className={`h-4 w-4 ${totals.ratio > 80 ? 'text-red-500' : 'text-yellow-500'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totals.ratio > 80 ? 'text-red-600' : 'text-slate-900'}`}>
                            {totals.ratio.toFixed(1)}%
                        </div>
                        <p className="text-xs text-muted-foreground">impacto das despesas na receita</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Lucro Bruto</CardTitle>
                        <Building2 className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totals.receita - totals.despesa >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatBRL(totals.receita - totals.despesa)}
                        </div>
                        <p className="text-xs text-muted-foreground">resultado operacional</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Evolução Mensal (Receita vs Despesa)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis 
                                        tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`} 
                                        fontSize={12} 
                                        tickLine={false} 
                                        axisLine={false} 
                                    />
                                    <Tooltip formatter={(value) => formatBRL(value)} />
                                    <Legend />
                                    <Line type="monotone" dataKey="receita" name="Receita" stroke="#10B981" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#EF4444" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Top Despesas por Categoria</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatBRL(value)} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Comparativo por Filial</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={companyData} layout="vertical" margin={{ left: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`} fontSize={12} />
                                    <YAxis dataKey="name" type="category" width={100} fontSize={12} />
                                    <Tooltip formatter={(value) => formatBRL(value)} cursor={{fill: 'transparent'}} />
                                    <Legend />
                                    <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                                    <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}