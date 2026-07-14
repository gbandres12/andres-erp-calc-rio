import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Loader2, CheckCircle, XCircle, Clock, Server } from "lucide-react";
import { testFiscalConnection } from "@/functions/testFiscalConnection";
import { toast } from "sonner";

export default function FiscalConnectionTest({ companyId, config }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const runTest = async () => {
    if (!config?.uf) {
      return toast.error("Configure a UF do emitente antes de testar");
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await testFiscalConnection({ company_id: companyId });
      const data = res.data;
      setResult(data);
      if (data.success) {
        toast.success("SEFAZ acessível e em operação!");
      } else if (data.cStat) {
        toast.warning(`SEFAZ respondeu mas com status: ${data.cStat}`);
      } else {
        toast.error("Falha na conexão com SEFAZ");
      }
    } catch (e) {
      setResult({ success: false, error: e.message });
      toast.error("Erro ao testar: " + e.message);
    } finally {
      setTesting(false);
    }
  };

  const envLabel = config?.environment === 'producao' ? '🔴 Produção' : '🟡 Homologação';
  const uf = config?.uf || '—';

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-slate-800">Teste de Conexão SEFAZ</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Verifica se o serviço do SEFAZ está acessível para <strong>{uf}</strong> em {envLabel}
            </p>
          </div>
          <Button
            onClick={runTest}
            disabled={testing}
            variant="outline"
            className="border-violet-300 text-violet-700 hover:bg-violet-50"
          >
            {testing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando...</>
              : <><Wifi className="w-4 h-4 mr-2" /> Testar Agora</>
            }
          </Button>
        </div>

        {/* Último teste salvo */}
        {config?.last_test_at && !result && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">
              Último teste: {new Date(config.last_test_at).toLocaleString('pt-BR')} —{" "}
            </span>
            {config.last_test_status === 'ok'
              ? <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
              : <span className="text-red-600 font-medium flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Erro</span>
            }
          </div>
        )}
      </div>

      {/* Resultado do teste */}
      {result && (
        <div className={`rounded-xl border p-5 ${
          result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-start gap-3">
            {result.success
              ? <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1 space-y-2">
              <p className={`font-semibold ${result.success ? "text-green-800" : "text-red-800"}`}>
                {result.success ? "Conexão bem-sucedida!" : "Falha na conexão"}
              </p>

              {result.message && (
                <p className={`text-sm ${result.success ? "text-green-700" : "text-red-700"}`}>
                  {result.message}
                </p>
              )}

              {result.error && (
                <p className="text-sm text-red-700 font-mono bg-red-100 rounded p-2">
                  {result.error}
                </p>
              )}

              {/* Detalhes técnicos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {result.cStat && (
                  <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                    <p className="text-xs text-slate-500">Código SEFAZ</p>
                    <p className="font-mono font-bold text-slate-800">{result.cStat}</p>
                  </div>
                )}
                {result.http_status && (
                  <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                    <p className="text-xs text-slate-500">HTTP Status</p>
                    <p className={`font-bold ${result.http_status < 400 ? "text-green-700" : "text-red-700"}`}>
                      {result.http_status}
                    </p>
                  </div>
                )}
                {result.duration_ms && (
                  <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                    <p className="text-xs text-slate-500">Latência</p>
                    <p className="font-bold text-slate-800">{result.duration_ms} ms</p>
                  </div>
                )}
              </div>

              {result.endpoint && (
                <div className="flex items-center gap-1 mt-1">
                  <Server className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs text-slate-400 font-mono break-all">{result.endpoint}</p>
                </div>
              )}

              {result.xMotivo && (
                <p className="text-xs text-slate-500 italic">Motivo: {result.xMotivo}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Informações sobre os ambientes */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">ℹ️ Sobre os ambientes SEFAZ:</p>
        <p>🟡 <strong>Homologação:</strong> Use para testes. Notas emitidas não têm validade fiscal.</p>
        <p>🔴 <strong>Produção:</strong> Emissão real. Notas têm validade fiscal e geram obrigações.</p>
        <p className="text-blue-600 mt-1">
          ⚠️ Sempre teste em homologação antes de mudar para produção.
        </p>
      </div>
    </div>
  );
}