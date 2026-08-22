import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function DeletionPasswordSettings() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password || !/^\d{4,6}$/.test(password)) {
      setError("A senha deve ter entre 4 e 6 dígitos numéricos");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não conferem");
      return;
    }

    setLoading(true);
    try {
      const companyId = localStorage.getItem("selectedCompanyId");
      const { data } = await base44.functions.invoke("setDeletionPassword", {
        company_id: companyId,
        password
      });

      if (data?.success) {
        toast.success("Senha de exclusão reconfigurada com sucesso!");
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(data?.error || "Erro ao salvar senha");
      }
    } catch (err) {
      setError("Erro ao salvar senha: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Lock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Senha de Exclusão (4 a 6 dígitos)</p>
            <p className="text-xs text-amber-800 mt-1">
              Esta senha é exigida para excluir vendas e lançamentos financeiros.
              Ela é específica por filial. Configure uma sequência de 4 a 6 dígitos numéricos.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="del-pwd">Nova Senha (4 a 6 dígitos) *</Label>
          <div className="relative">
            <Input
              id="del-pwd"
              type={showPassword ? "text" : "password"}
              maxLength="6"
              placeholder="0000"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-widest font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500">Apenas números</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="del-pwd-confirm">Confirmar Senha *</Label>
          <Input
            id="del-pwd-confirm"
            type={showPassword ? "text" : "password"}
            maxLength="6"
            placeholder="0000"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center text-2xl tracking-widest font-mono"
          />
        </div>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700">
          <Shield className="w-4 h-4 mr-2" />
          {loading ? "Salvando..." : "Reconfigurar Senha"}
        </Button>
      </form>
    </div>
  );
}