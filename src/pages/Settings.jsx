import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Building2, Bell, Shield, Palette } from "lucide-react";
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
      </Tabs>
    </div>
  );
}