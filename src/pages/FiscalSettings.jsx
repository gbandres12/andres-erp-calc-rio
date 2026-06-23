import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Settings, AlertTriangle, CheckCircle } from "lucide-react";

const REGIME_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional (CRT 1)" },
  { value: "lucro_presumido", label: "Lucro Presumido (CRT 3)" },
  { value: "lucro_real", label: "Lucro Real (CRT 3)" },
];

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export default function FiscalSettings() {
  const companyId = localStorage.getItem("selectedCompanyId");
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["fiscal_config", companyId],
    queryFn: () => base44.entities.FiscalConfig.filter({ company_id: companyId }),
    enabled: !!companyId
  });

  const config = configs[0];

  const [form, setForm] = useState(null);

  React.useEffect(() => {
    if (config && !form) {
      setForm({ ...config });
    } else if (!config && !form) {
      setForm({
        company_id: companyId,
        environment: "homologacao",
        document_type: "nfe",
        serie: "1",
        next_number: 1,
        regime_tributario: "simples_nacional",
        crt: 1,
        is_active: true
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (config?.id) {
        return base44.entities.FiscalConfig.update(config.id, data);
      } else {
        return base44.entities.FiscalConfig.create(data);
      }
    },
    onSuccess: () => {
      toast.success("Configurações fiscais salvas!");
      queryClient.invalidateQueries(["fiscal_config", companyId]);
    },
    onError: (e) => toast.error(e.message)
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleRegime = (value) => {
    const crt = value === "simples_nacional" ? 1 : 3;
    setForm(prev => ({ ...prev, regime_tributario: value, crt }));
  };

  if (isLoading || !form) return null;

  const isConfigured = !!config?.api_token;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-violet-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações Fiscais</h1>
          <p className="text-slate-500 text-sm">Configuração da emissão via Focus NFe</p>
        </div>
      </div>

      {/* Status da API */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${isConfigured ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
        {isConfigured
          ? <CheckCircle className="w-5 h-5 text-green-600" />
          : <AlertTriangle className="w-5 h-5 text-yellow-600" />}
        <div>
          <p className={`text-sm font-medium ${isConfigured ? "text-green-700" : "text-yellow-700"}`}>
            {isConfigured ? "Token da API configurado" : "Token da API não configurado"}
          </p>
          <p className={`text-xs ${isConfigured ? "text-green-600" : "text-yellow-600"}`}>
            {isConfigured
              ? `Ambiente: ${form.environment === "producao" ? "🔴 Produção" : "🟡 Homologação"}`
              : "Você pode configurar todos os dados agora e adicionar o token quando tiver acesso à Focus NFe"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="font-semibold text-slate-800">Dados do Emitente</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>CNPJ *</Label>
            <Input placeholder="00.000.000/0001-00" value={form.cnpj || ""} onChange={e => handleChange("cnpj", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Razão Social *</Label>
            <Input placeholder="Empresa Ltda" value={form.razao_social || ""} onChange={e => handleChange("razao_social", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nome Fantasia</Label>
            <Input value={form.nome_fantasia || ""} onChange={e => handleChange("nome_fantasia", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Inscrição Estadual</Label>
            <Input value={form.inscricao_estadual || ""} onChange={e => handleChange("inscricao_estadual", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Inscrição Municipal (NFS-e)</Label>
            <Input value={form.inscricao_municipal || ""} onChange={e => handleChange("inscricao_municipal", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Regime Tributário</Label>
            <Select value={form.regime_tributario || "simples_nacional"} onValueChange={handleRegime}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <Label>Logradouro</Label>
            <Input value={form.logradouro || ""} onChange={e => handleChange("logradouro", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Número</Label>
            <Input value={form.numero || ""} onChange={e => handleChange("numero", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bairro</Label>
            <Input value={form.bairro || ""} onChange={e => handleChange("bairro", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Município</Label>
            <Input value={form.municipio || ""} onChange={e => handleChange("municipio", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>UF</Label>
            <Select value={form.uf || ""} onValueChange={v => handleChange("uf", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>CEP</Label>
            <Input placeholder="00000-000" value={form.cep || ""} onChange={e => handleChange("cep", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="font-semibold text-slate-800">Configurações de Emissão</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Tipo de Documento</Label>
            <Select value={form.document_type || "nfe"} onValueChange={v => handleChange("document_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nfe">NF-e</SelectItem>
                <SelectItem value="nfse">NFS-e</SelectItem>
                <SelectItem value="nfce">NFC-e</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Série</Label>
            <Input value={form.serie || "1"} onChange={e => handleChange("serie", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ambiente</Label>
            <Select value={form.environment || "homologacao"} onValueChange={v => handleChange("environment", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">🟡 Homologação</SelectItem>
                <SelectItem value="producao">🔴 Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="font-semibold text-slate-800">Credenciais Focus NFe</h3>
        <p className="text-sm text-slate-500">O token será usado para autenticar as chamadas à API. Você pode deixar em branco por enquanto e preencher quando tiver acesso.</p>
        <div className="space-y-1">
          <Label>Token da API Focus NFe</Label>
          <Input
            type="password"
            placeholder="Seu token de acesso (obtenha em app.focusnfe.com.br)"
            value={form.api_token || ""}
            onChange={e => handleChange("api_token", e.target.value)}
          />
        </div>
      </div>

      <Button
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending || !form.cnpj || !form.razao_social}
        className="w-full bg-violet-600 hover:bg-violet-700"
      >
        <Save className="w-4 h-4 mr-2" />
        {saveMutation.isPending ? "Salvando..." : "Salvar Configurações Fiscais"}
      </Button>
    </div>
  );
}