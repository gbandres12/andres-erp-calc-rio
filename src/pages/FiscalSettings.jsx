import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Save, Settings, Building2, ShieldCheck, Wifi, AlertTriangle, CheckCircle, Info } from "lucide-react";
import CertificateUpload from "@/components/fiscal/CertificateUpload";
import FiscalConnectionTest from "@/components/fiscal/FiscalConnectionTest";

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

  const { data: certs = [] } = useQuery({
    queryKey: ["fiscal_cert", companyId],
    queryFn: () => base44.entities.FiscalCertificate.filter({ company_id: companyId }),
    enabled: !!companyId
  });

  const config = configs[0];
  const certificate = certs[0];

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
      if (config?.id) return base44.entities.FiscalConfig.update(config.id, data);
      return base44.entities.FiscalConfig.create(data);
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

  const handleEnvironmentChange = (value) => {
    if (value === 'producao') {
      if (!window.confirm("⚠️ Tem certeza que deseja mudar para PRODUÇÃO?\n\nNF-e emitidas em produção têm validade fiscal real e geram obrigações tributárias. Confirme apenas se já testou em homologação.")) {
        return;
      }
    }
    handleChange("environment", value);
  };

  if (isLoading || !form) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isEmitenteDone = !!(form.cnpj && form.razao_social && form.uf && form.municipio);
  const isCertDone = !!certificate?.file_uri;
  const isReadyForProduction = isEmitenteDone && isCertDone && config?.id;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Settings className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo Fiscal</h1>
          <p className="text-slate-500 text-sm">Configuração de emissão direta de NF-e via SEFAZ (sem API paga)</p>
        </div>
      </div>

      {/* Status geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusCard
          icon={Building2}
          title="Dados do Emitente"
          done={isEmitenteDone}
          doneText="Configurado"
          pendingText="Preencher CNPJ, UF e município"
        />
        <StatusCard
          icon={ShieldCheck}
          title="Certificado A1"
          done={isCertDone}
          doneText={certificate?.file_name || "Carregado"}
          pendingText="Nenhum certificado"
        />
        <StatusCard
          icon={Wifi}
          title="Ambiente"
          done={!!config?.id}
          doneText={form.environment === 'producao' ? '🔴 Produção' : '🟡 Homologação'}
          pendingText="Não configurado"
          isWarning={form.environment === 'producao'}
        />
      </div>

      {/* Alerta de prontidão */}
      {!isReadyForProduction && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <p className="font-semibold">Configure os três passos para habilitar a emissão</p>
            <p className="mt-0.5">1. Dados do emitente → 2. Upload do certificado A1 → 3. Teste de conexão</p>
          </div>
        </div>
      )}

      {/* Abas */}
      <Tabs defaultValue="emitente">
        <TabsList className="w-full">
          <TabsTrigger value="emitente" className="flex-1 gap-1.5">
            <Building2 className="w-4 h-4" /> Emitente
          </TabsTrigger>
          <TabsTrigger value="certificado" className="flex-1 gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Certificado A1
          </TabsTrigger>
          <TabsTrigger value="ambiente" className="flex-1 gap-1.5">
            <Wifi className="w-4 h-4" /> Ambiente & Testes
          </TabsTrigger>
        </TabsList>

        {/* ABA 1 — EMITENTE */}
        <TabsContent value="emitente" className="mt-5 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="font-semibold text-slate-800">Identificação da Empresa</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="CNPJ *">
                <Input placeholder="00.000.000/0001-00" value={form.cnpj || ""} onChange={e => handleChange("cnpj", e.target.value)} />
              </Field>
              <Field label="Razão Social *">
                <Input placeholder="Empresa Ltda" value={form.razao_social || ""} onChange={e => handleChange("razao_social", e.target.value)} />
              </Field>
              <Field label="Nome Fantasia">
                <Input value={form.nome_fantasia || ""} onChange={e => handleChange("nome_fantasia", e.target.value)} />
              </Field>
              <Field label="Inscrição Estadual">
                <Input value={form.inscricao_estadual || ""} onChange={e => handleChange("inscricao_estadual", e.target.value)} />
              </Field>
              <Field label="Inscrição Municipal (NFS-e)">
                <Input value={form.inscricao_municipal || ""} onChange={e => handleChange("inscricao_municipal", e.target.value)} />
              </Field>
              <Field label="Regime Tributário">
                <Select value={form.regime_tributario || "simples_nacional"} onValueChange={handleRegime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.email || ""} onChange={e => handleChange("email", e.target.value)} />
              </Field>
              <Field label="Telefone">
                <Input value={form.telefone || ""} onChange={e => handleChange("telefone", e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="font-semibold text-slate-800">Endereço do Estabelecimento</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Logradouro">
                <Input value={form.logradouro || ""} onChange={e => handleChange("logradouro", e.target.value)} />
              </Field>
              <Field label="Número">
                <Input value={form.numero || ""} onChange={e => handleChange("numero", e.target.value)} />
              </Field>
              <Field label="Complemento">
                <Input value={form.complemento || ""} onChange={e => handleChange("complemento", e.target.value)} />
              </Field>
              <Field label="Bairro">
                <Input value={form.bairro || ""} onChange={e => handleChange("bairro", e.target.value)} />
              </Field>
              <Field label="Município *">
                <Input value={form.municipio || ""} onChange={e => handleChange("municipio", e.target.value)} />
              </Field>
              <Field label="UF *">
                <Select value={form.uf || ""} onValueChange={v => handleChange("uf", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="CEP">
                <Input placeholder="00000-000" value={form.cep || ""} onChange={e => handleChange("cep", e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-800">Configurações de Emissão</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Tipo de Documento">
                <Select value={form.document_type || "nfe"} onValueChange={v => handleChange("document_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nfe">NF-e (Produto)</SelectItem>
                    <SelectItem value="nfse">NFS-e (Serviço)</SelectItem>
                    <SelectItem value="nfce">NFC-e (Consumidor)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Série">
                <Input value={form.serie || "1"} onChange={e => handleChange("serie", e.target.value)} />
              </Field>
              <Field label="Próximo Número">
                <Input type="number" value={form.next_number || 1} onChange={e => handleChange("next_number", Number(e.target.value))} />
              </Field>
            </div>
          </div>

          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.cnpj || !form.razao_social}
            className="w-full bg-violet-600 hover:bg-violet-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Dados do Emitente"}
          </Button>
        </TabsContent>

        {/* ABA 2 — CERTIFICADO */}
        <TabsContent value="certificado" className="mt-5">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-semibold">Sobre o Certificado Digital A1</p>
                <p className="mt-1">O certificado A1 é um arquivo <strong>.pfx</strong> ou <strong>.p12</strong> emitido por uma Autoridade Certificadora (AC) credenciada pelo ICP-Brasil. Ele é necessário para assinar digitalmente as NF-e antes de enviá-las ao SEFAZ.</p>
                <p className="mt-1">Autoridades Certificadoras comuns: <strong>Serasa, Certisign, Valid, Soluti, SAFEWEB</strong></p>
              </div>
            </div>
            <CertificateUpload companyId={companyId} certificate={certificate} />
          </div>
        </TabsContent>

        {/* ABA 3 — AMBIENTE & TESTES */}
        <TabsContent value="ambiente" className="mt-5 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h3 className="font-semibold text-slate-800">Ambiente de Emissão</h3>

            <div className="grid md:grid-cols-2 gap-4">
              <div
                onClick={() => handleEnvironmentChange("homologacao")}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  form.environment === 'homologacao'
                    ? 'border-yellow-400 bg-yellow-50'
                    : 'border-slate-200 hover:border-yellow-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🟡</span>
                  <span className="font-semibold text-slate-800">Homologação</span>
                  {form.environment === 'homologacao' && (
                    <CheckCircle className="w-4 h-4 text-yellow-600 ml-auto" />
                  )}
                </div>
                <p className="text-sm text-slate-500">Ambiente de testes. Notas não têm validade fiscal.</p>
                <p className="text-xs text-yellow-700 font-medium mt-2">✅ Recomendado para começar</p>
              </div>

              <div
                onClick={() => handleEnvironmentChange("producao")}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  form.environment === 'producao'
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-200 hover:border-red-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🔴</span>
                  <span className="font-semibold text-slate-800">Produção</span>
                  {form.environment === 'producao' && (
                    <CheckCircle className="w-4 h-4 text-red-600 ml-auto" />
                  )}
                </div>
                <p className="text-sm text-slate-500">Emissão real com validade fiscal e obrigações tributárias.</p>
                <p className="text-xs text-red-700 font-medium mt-2">⚠️ Apenas após testes aprovados</p>
              </div>
            </div>

            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Ambiente"}
            </Button>
          </div>

          {/* Teste de Conexão */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Teste de Conexão com SEFAZ</h3>
            <FiscalConnectionTest companyId={companyId} config={config || form} />
          </div>

          {/* Checklist de prontidão */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Checklist de Prontidão</h3>
            <div className="space-y-2">
              {[
                { done: !!(form.cnpj && form.razao_social), label: "CNPJ e Razão Social configurados" },
                { done: !!(form.uf && form.municipio), label: "UF e Município do emitente preenchidos" },
                { done: !!form.inscricao_estadual, label: "Inscrição Estadual informada" },
                { done: isCertDone, label: "Certificado A1 carregado" },
                { done: config?.last_test_status === 'ok', label: "Teste de conexão com SEFAZ aprovado" },
                { done: form.environment === 'homologacao', label: "Ambiente de homologação ativo para testes" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  {item.done
                    ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                  }
                  <span className={`text-sm ${item.done ? "text-slate-700" : "text-slate-400"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusCard({ icon: Icon, title, done, doneText, pendingText, isWarning }) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${
      done
        ? isWarning ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
        : "bg-slate-50 border-slate-200"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        done ? isWarning ? "bg-red-100" : "bg-green-100" : "bg-slate-200"
      }`}>
        <Icon className={`w-4 h-4 ${done ? isWarning ? "text-red-600" : "text-green-600" : "text-slate-400"}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{title}</p>
        <p className={`text-sm font-semibold mt-0.5 ${done ? isWarning ? "text-red-700" : "text-green-700" : "text-slate-400"}`}>
          {done ? doneText : pendingText}
        </p>
      </div>
    </div>
  );
}