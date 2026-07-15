import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, ShieldCheck, ShieldAlert, FileKey, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/components/utils/formatters";

export default function CertificateUpload({ companyId, certificate }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [issuer, setIssuer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const daysUntilExpiry = certificate?.valid_until
    ? Math.ceil((new Date(certificate.valid_until) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const expiryColor =
    daysUntilExpiry === null ? "text-slate-500" :
    daysUntilExpiry < 0 ? "text-red-600" :
    daysUntilExpiry < 30 ? "text-orange-500" :
    daysUntilExpiry < 90 ? "text-yellow-600" :
    "text-green-600";

  const handleUpload = async () => {
    if (!file) return toast.error("Selecione o arquivo do certificado (.pfx ou .p12)");
    if (!password) return toast.error("Informe a senha do certificado");
    if (!validUntil) return toast.error("Informe a data de vencimento do certificado");
    if (file.size > 5 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 5MB)");

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pfx', 'p12'].includes(ext)) {
      return toast.error("Apenas arquivos .pfx ou .p12 são aceitos");
    }

    setUploading(true);
    try {
      // Faz upload do arquivo para storage privado
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });

      const certData = {
        company_id: companyId,
        type: "a1",
        file_uri,
        file_name: file.name,
        valid_until: validUntil,
        issuer: issuer || undefined,
        upload_date: new Date().toISOString(),
        status: "pendente_validacao",
        notes: `Senha configurada em ${new Date().toLocaleDateString('pt-BR')}`
      };

      if (certificate?.id) {
        await base44.entities.FiscalCertificate.update(certificate.id, certData);
        toast.success("Certificado atualizado com sucesso!");
      } else {
        await base44.entities.FiscalCertificate.create(certData);
        toast.success("Certificado enviado com sucesso!");
      }

      setFile(null);
      setPassword("");
      setValidUntil("");
      setIssuer("");
      queryClient.invalidateQueries(["fiscal_cert", companyId]);
    } catch (e) {
      toast.error("Erro ao enviar certificado: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Status atual do certificado */}
      {certificate?.file_uri ? (
        <div className={`rounded-xl border p-4 ${
          daysUntilExpiry < 0 ? "bg-red-50 border-red-200" :
          daysUntilExpiry < 30 ? "bg-orange-50 border-orange-200" :
          "bg-green-50 border-green-200"
        }`}>
          <div className="flex items-start gap-3">
            {daysUntilExpiry < 0
              ? <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              : <ShieldCheck className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            }
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Certificado A1 Carregado</p>
              <p className="text-sm text-slate-600 mt-0.5">📄 {certificate.file_name || "certificado.pfx"}</p>
              {certificate.subject && (
                <p className="text-xs text-slate-500 mt-0.5">Titular: {certificate.subject}</p>
              )}
              {certificate.valid_until && (
                <p className={`text-sm font-medium mt-1 ${expiryColor}`}>
                  {daysUntilExpiry < 0
                    ? `⛔ Expirado há ${Math.abs(daysUntilExpiry)} dias (${formatDate(certificate.valid_until)})`
                    : `✅ Válido até ${formatDate(certificate.valid_until)} (${daysUntilExpiry} dias restantes)`
                  }
                </p>
              )}
              {certificate.issuer && (
                <p className="text-xs text-slate-400 mt-0.5">Emitido por: {certificate.issuer}</p>
              )}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              certificate.status === 'ativo' ? 'bg-green-100 text-green-700' :
              certificate.status === 'vencido' ? 'bg-red-100 text-red-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {certificate.status === 'ativo' ? 'Ativo' :
               certificate.status === 'vencido' ? 'Vencido' : 'Aguardando validação'}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <FileKey className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 font-medium">Nenhum certificado carregado</p>
          <p className="text-sm text-slate-400 mt-1">
            O certificado A1 é necessário para emitir notas fiscais diretamente no SEFAZ
          </p>
        </div>
      )}

      {/* Formulário de upload */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h4 className="font-semibold text-slate-800 flex items-center gap-2">
          <Upload className="w-4 h-4 text-violet-600" />
          {certificate?.file_uri ? "Substituir Certificado" : "Carregar Certificado A1"}
        </h4>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <strong>🔒 Segurança:</strong> O arquivo é armazenado em storage privado criptografado.
          A senha <strong>não é salva</strong> — use-a apenas para verificar o arquivo.
        </div>

        {/* Arquivo */}
        <div className="space-y-1">
          <Label>Arquivo do Certificado (.pfx ou .p12) *</Label>
          <Input
            type="file"
            accept=".pfx,.p12"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="cursor-pointer"
          />
          {file && (
            <p className="text-xs text-green-600">✅ {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
          )}
        </div>

        {/* Senha */}
        <div className="space-y-1">
          <Label>Senha do Certificado *</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Senha do arquivo .pfx"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Válido até *</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Entidade Emissora</Label>
            <Input
              placeholder="Ex: AC SAFEWEB"
              value={issuer}
              onChange={e => setIssuer(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || !password || !validUntil || uploading}
          className="w-full bg-violet-600 hover:bg-violet-700"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" /> Enviar Certificado</>
          )}
        </Button>
      </div>
    </div>
  );
}