import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Building2, Bell, Shield, Palette, RefreshCw, Bot } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [settings, setSettings] = useState({
    notifications_enabled: true,
    email_notifications: true,
    low_stock_alerts: true,
    transfer_alerts: true,
    refresh_interval: "0",
    theme: "light"
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await base44.auth.updateMe({ settings });
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 mt-1">Gerencie as configurações do sistema</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
          <TabsTrigger value="appearance">Aparência</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <CardTitle>Configurações Gerais</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input placeholder="Nome da sua empresa" />
              </div>
              <div className="space-y-2">
                <Label>Email de Contato</Label>
                <Input type="email" placeholder="contato@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="(00) 0000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Fuso Horário</Label>
                <Input value="America/Sao_Paulo" disabled className="bg-slate-100" />
              </div>

              <div className="space-y-2">
                <Label>Intervalo de Atualização Automática (Dados)</Label>
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                  <select 
                    className="flex-1 bg-transparent border-none text-sm focus:ring-0"
                    value={settings.refresh_interval}
                    onChange={(e) => {
                      setSettings({...settings, refresh_interval: e.target.value});
                      // Save to local storage for immediate effect in Layout without fetch
                      localStorage.setItem('refresh_interval', e.target.value);
                    }}
                  >
                    <option value="0">Manual (Sem atualização automática)</option>
                    <option value="60000">1 Minuto</option>
                    <option value="300000">5 Minutos</option>
                    <option value="600000">10 Minutos</option>
                    <option value="1800000">30 Minutos</option>
                  </select>
                </div>
                <p className="text-xs text-slate-500">Define com que frequência os dados da tela são recarregados automaticamente.</p>
              </div>

              <Button onClick={handleSaveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <CardTitle>Notificações</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações do Sistema</p>
                  <p className="text-sm text-slate-500">Receber notificações gerais do sistema</p>
                </div>
                <Switch 
                  checked={settings.notifications_enabled}
                  onCheckedChange={(checked) => setSettings({...settings, notifications_enabled: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações por Email</p>
                  <p className="text-sm text-slate-500">Receber alertas importantes por email</p>
                </div>
                <Switch 
                  checked={settings.email_notifications}
                  onCheckedChange={(checked) => setSettings({...settings, email_notifications: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Alertas de Estoque Baixo</p>
                  <p className="text-sm text-slate-500">Notificar quando produtos atingirem estoque mínimo</p>
                </div>
                <Switch 
                  checked={settings.low_stock_alerts}
                  onCheckedChange={(checked) => setSettings({...settings, low_stock_alerts: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Alertas de Transferências</p>
                  <p className="text-sm text-slate-500">Notificar sobre transferências pendentes</p>
                </div>
                <Switch 
                  checked={settings.transfer_alerts}
                  onCheckedChange={(checked) => setSettings({...settings, transfer_alerts: checked})}
                />
              </div>
              <Button onClick={handleSaveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Preferências
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <CardTitle>Segurança</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Autenticação:</strong> Gerenciada automaticamente pela plataforma Base44
                </p>
              </div>
              <div className="space-y-2">
                <Label>Permissões do Usuário</Label>
                <Input value={user?.role || 'user'} disabled className="bg-slate-100" />
                <p className="text-xs text-slate-500">
                  Contate o administrador para alterar suas permissões
                </p>
              </div>
              <div className="space-y-2">
                <Label>Sessão Ativa</Label>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-slate-600">Conectado como: <strong>{user?.email}</strong></p>
                  <p className="text-xs text-slate-500 mt-1">Último acesso: {new Date().toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-blue-600" />
                <CardTitle>Aparência</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Tema do Sistema</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    className={`p-4 border-2 rounded-lg cursor-pointer ${settings.theme === 'light' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                    onClick={() => setSettings({...settings, theme: 'light'})}
                  >
                    <div className="w-full h-20 bg-white rounded mb-2 border"></div>
                    <p className="text-sm font-medium text-center">Claro</p>
                  </div>
                  <div 
                    className={`p-4 border-2 rounded-lg cursor-pointer ${settings.theme === 'dark' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                    onClick={() => setSettings({...settings, theme: 'dark'})}
                  >
                    <div className="w-full h-20 bg-slate-800 rounded mb-2 border"></div>
                    <p className="text-sm font-medium text-center">Escuro</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Tema escuro em breve disponível</p>
              </div>
              <Button onClick={handleSaveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Preferências
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-600" />
                <CardTitle>Integrações (Telegram)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-slate-50 border rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">SalesBot (Vendas)</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Configure o Webhook para conectar o bot de vendas do Telegram ao sistema.
                  Certifique-se de que o token SALES_BOT_TOKEN está configurado nos segredos.
                </p>
                <Button 
                  onClick={async () => {
                    try {
                      const toastId = toast.loading("Configurando Webhook...");
                      const { data } = await base44.functions.invoke("setupSalesBotWebhook", { 
                        baseUrl: window.location.origin 
                      });
                      
                      if (data.ok) {
                        toast.success("Webhook configurado com sucesso!", { id: toastId });
                      } else {
                        toast.error("Erro ao configurar: " + (data.description || data.error), { id: toastId });
                      }
                    } catch (e) {
                      toast.error("Erro na requisição: " + e.message);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  Configurar Webhook SalesBot
                </Button>
              </div>

              <div className="p-4 bg-slate-50 border rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">FinanceiroBot (Geral)</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Bot principal para gestão financeira e administrativa.
                  Usa o token TELEGRAM_BOT_TOKEN.
                </p>
                 <Button 
                  onClick={async () => {
                     try {
                      const toastId = toast.loading("Configurando Webhook Financeiro...");
                      // Reutilizando a lógica, assumindo que existe uma função similar ou adaptando
                      // Como não criamos uma func especifica pra setup do financeiro agora, 
                      // vamos deixar apenas informativo ou criar a func se necessário depois.
                      toast.info("Configuração manual necessária ou função pendente.");
                    } catch (e) {
                      toast.error("Erro: " + e.message);
                    }
                  }}
                  variant="outline"
                  disabled
                >
                  <Bot className="w-4 h-4 mr-2" />
                  Configurar Webhook Financeiro (Em breve)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}