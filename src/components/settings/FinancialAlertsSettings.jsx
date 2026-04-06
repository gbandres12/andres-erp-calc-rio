import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Save, TestTube2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FinancialAlertsSettings() {
  const [alertSettings, setAlertSettings] = useState({
    alerts_enabled: false,
    days_before_due: 3,
    payable_threshold: 0,
    receivable_threshold: 0,
  });
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.alert_settings) {
        setAlertSettings({ ...alertSettings, ...user.alert_settings });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    try {
      await base44.auth.updateMe({ alert_settings: alertSettings });
      toast.success("Configurações de alertas salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await base44.functions.invoke('checkFinancialAlerts', {});
      toast.success("Alerta de teste enviado para seu email!");
    } catch (e) {
      toast.error("Erro ao enviar teste: " + e.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <CardTitle>Alertas Financeiros Automáticos</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <p>Receba emails automáticos com alertas de vencimentos próximos, contas em atraso e valores acima dos thresholds definidos.</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Ativar Alertas por Email</p>
            <p className="text-sm text-slate-500">Receber emails diários com alertas financeiros</p>
          </div>
          <Switch
            checked={alertSettings.alerts_enabled}
            onCheckedChange={(v) => setAlertSettings(s => ({ ...s, alerts_enabled: v }))}
          />
        </div>

        <div className={`space-y-4 ${!alertSettings.alerts_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="space-y-2">
            <Label>Avisar com quantos dias de antecedência?</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={30}
                value={alertSettings.days_before_due}
                onChange={(e) => setAlertSettings(s => ({ ...s, days_before_due: parseInt(e.target.value) || 3 }))}
                className="w-24"
              />
              <span className="text-sm text-slate-500">dia(s) antes do vencimento</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Threshold Contas a Pagar (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={alertSettings.payable_threshold}
                onChange={(e) => setAlertSettings(s => ({ ...s, payable_threshold: parseFloat(e.target.value) || 0 }))}
                placeholder="0 = qualquer valor"
              />
              <p className="text-xs text-slate-400">Alertar somente se o total a pagar ultrapassar este valor. 0 = sempre alertar.</p>
            </div>

            <div className="space-y-2">
              <Label>Threshold Contas a Receber (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={alertSettings.receivable_threshold}
                onChange={(e) => setAlertSettings(s => ({ ...s, receivable_threshold: parseFloat(e.target.value) || 0 }))}
                placeholder="0 = desativado"
              />
              <p className="text-xs text-slate-400">Alertar somente se o total a receber ultrapassar este valor.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Salvar Configurações
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !alertSettings.alerts_enabled}
            className="gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
            Testar Agora
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}