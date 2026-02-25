import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { Loader2, TrendingUp, AlertCircle, Sparkles, Target, Calendar } from "lucide-react";

export default function SalesForecastPage() {
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  
  const { data: forecastData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['salesForecast', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) throw new Error("Selecione uma filial primeiro.");
      const response = await base44.functions.invoke('generateSalesForecast', { 
        company_id: selectedCompanyId 
      });
      return response.data;
    },
    enabled: !!selectedCompanyId,
    refetchOnWindowFocus: false,
    retry: false
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-8 flex justify-center">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Atenção</AlertTitle>
          <AlertDescription>
            Selecione uma filial no menu para visualizar a previsão de vendas.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Format data for charts
  const historyChartData = forecastData?.historical_data?.monthly_sales_history 
    ? Object.entries(forecastData.historical_data.monthly_sales_history)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({
          date,
          vendas: value
        }))
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-purple-600" />
            Previsão de Vendas com IA
          </h1>
          <p className="text-slate-500 mt-1">
            Análise preditiva baseada em histórico e pipeline de oportunidades.
          </p>
        </div>
        <Button 
          onClick={() => refetch()} 
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Gerando Análise...
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4 mr-2" />
              Atualizar Previsão
            </>
          )}
        </Button>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro na geração</AlertTitle>
          <AlertDescription>
            {error?.message || "Não foi possível gerar a previsão. Tente novamente."}
          </AlertDescription>
        </Alert>
      )}

      {isLoading && !forecastData && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
          <p className="text-slate-500">Nossa IA está analisando seus dados de vendas...</p>
        </div>
      )}

      {forecastData && (
        <>
          {/* Main Forecast Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white border-none shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-purple-100 flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5" />
                  Próxima Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-1">
                  R$ {forecastData.forecast_next_week?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                <p className="text-purple-100 text-sm opacity-90">
                  Previsão de fechamento
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white border-none shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-indigo-100 flex items-center gap-2 text-lg">
                  <Target className="w-5 h-5" />
                  Próximo Mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-1">
                  R$ {forecastData.forecast_next_month?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                <p className="text-indigo-100 text-sm opacity-90">
                  Projeção mensal estimada
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-700 flex items-center gap-2 text-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Confiança da IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-4xl font-bold text-slate-900">
                    {forecastData.confidence_score}%
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div 
                    className="bg-green-600 h-2.5 rounded-full transition-all duration-1000" 
                    style={{ width: `${forecastData.confidence_score}%` }}
                  ></div>
                </div>
                <p className="text-slate-500 text-xs mt-2">
                  Baseado na consistência dos dados históricos e volume do pipeline.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Analysis & Recommendations */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Análise de Tendências</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Comportamento Histórico
                  </h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {forecastData.trend_analysis}
                  </p>
                </div>
                <div className="pt-4 border-t">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                    <Target className="w-4 h-4 text-orange-500" />
                    Análise do Pipeline
                  </h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {forecastData.pipeline_analysis}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-orange-100">
              <CardHeader>
                <CardTitle className="text-orange-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Recomendação Estratégica
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-700 leading-relaxed">
                  {forecastData.strategic_recommendation}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Historical Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Vendas (Últimos 6 Meses)</CardTitle>
              <CardDescription>Base para a projeção futura</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => {
                        const [year, month] = value.split('-');
                        return `${month}/${year}`;
                      }}
                      tick={{fontSize: 12}}
                    />
                    <YAxis 
                      tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      tick={{fontSize: 12}}
                    />
                    <Tooltip 
                      formatter={(value) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 'Vendas']}
                      labelFormatter={(label) => {
                        const [year, month] = label.split('-');
                        return `${month}/${year}`;
                      }}
                    />
                    <Bar dataKey="vendas" fill="#8884d8" radius={[4, 4, 0, 0]} name="Vendas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}