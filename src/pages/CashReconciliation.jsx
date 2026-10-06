import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Calculator, AlertTriangle, CheckCircle2, History, Lock, Scale } from "lucide-react";
import BalanceCheckTable from "@/components/reconciliation/BalanceCheckTable";
import BalanceLogTable from "@/components/reconciliation/BalanceLogTable";
import { formatBRL } from "@/components/utils/formatters";

export default function CashReconciliation() {
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState(localStorage.getItem('selectedCompanyId') || "todas");
  const [results, setResults] = useState([]);
  const [logEntries, setLogEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => { setUser(u); setUserLoaded(true); }).catch(() => setUserLoaded(true));
    base44.entities.Company.filter({ is_active: true }).then(setCompanies).catch(console.error);
  }, []);

  const isAdmin = user && (user.role === "admin" || user.custom_role === "admin");

  const runReconcile = useCallback(async () => {
    setLoading(true);
    try {
      const payload = companyFilter === "todas" ? {} : { company_id: companyFilter };
      const res = await base44.functions.invoke("reconcileBalances", payload);
      setResults((res.data && res.data.results) || res.results || []);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  const loadLog = useCallback(async () => {
    try {
      const query = companyFilter === "todas" ? {} : { company_id: companyFilter };
      const res = await base44.entities.BalanceLog.filter(query, { sort: "-created_date", limit: 100 });
      setLogEntries(res.items || []);
    } catch (e) {
      console.error(e);
      setLogEntries([]);
    }
  }, [companyFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    runReconcile();
    loadLog();
  }, [isAdmin, runReconcile, loadLog]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const targets = companyFilter === "todas"
        ? companies
        : companies.filter(c => c.id === companyFilter);
      for (const co of targets) {
        await base44.functions.invoke("recalculateBalance", { company_id: co.id });
      }
      await runReconcile();
      await loadLog();
    } catch (e) {
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  if (!userLoaded) {
    return <div className="p-8 text-center text-sm text-slate-500">Carregando...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <Lock className="w-8 h-8 mx-auto text-slate-400" />
            <h2 className="font-bold text-slate-900">Acesso restrito</h2>
            <p className="text-sm text-slate-500">Somente administradores podem acessar a conciliação de caixa.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const divergent = results.filter(r => !r.ok);
  const biggest = divergent.length
    ? divergent.reduce((a, b) => (Math.abs(b.difference) > Math.abs(a.difference) ? b : a))
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-6 h-6 text-violet-600" />
            Conciliação de Caixa
          </h1>
          <p className="text-sm text-slate-500">
            Confere o saldo gravado de cada conta com o saldo esperado pelo razão de lançamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={runReconcile}
            disabled={loading}
            className="border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Conferir
          </Button>
          <Button
            onClick={handleRecalculate}
            disabled={recalculating || companies.length === 0}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <Calculator className="w-4 h-4" />
            {recalculating ? "Recalculando..." : "Recalcular Saldos"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Contas conferidas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{results.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Contas divergentes</p>
            <p className={`text-2xl font-bold mt-1 ${divergent.length ? "text-red-600" : "text-green-600"}`}>
              {divergent.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Maior divergência</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {biggest ? formatBRL(biggest.difference) : formatBRL(0)}
            </p>
            {biggest && (
              <p className="text-xs text-slate-500 mt-1">{biggest.company_name} · {biggest.account_name}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 max-w-xs">
        <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Filial:</span>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as filiais</SelectItem>
            {companies.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="conciliacao">
        <TabsList>
          <TabsTrigger value="conciliacao" className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Conferência
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-1.5">
            <History className="w-4 h-4" />
            Log de Saldo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="conciliacao" className="mt-3">
          {divergent.length > 0 && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">
                {divergent.length} conta(s) com saldo diferente do esperado. Clique em "Recalcular Saldos"
                para corrigir com o valor do razão — cada correção fica registrada no Log de Saldo.
              </p>
            </div>
          )}
          <BalanceCheckTable results={results} loading={loading} />
        </TabsContent>
        <TabsContent value="log" className="mt-3">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-violet-600" />
                  Histórico de alterações de saldo
                </h3>
                <Badge variant="outline">{logEntries.length} registro(s)</Badge>
              </div>
              <BalanceLogTable entries={logEntries} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}