import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

export default function DeleteAuthDialog({ open, onClose, onSuccess, itemType = "venda" }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length !== 5) {
      setError("Senha deve ter exatamente 5 dígitos");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/base44/functions/validateDeletionPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: localStorage.getItem("selectedCompanyId"),
          password
        })
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Senha incorreta");
        return;
      }

      toast.success("Autenticado!");
      setPassword("");
      setError("");
      onClose();
      onSuccess();
    } catch (err) {
      setError("Erro ao validar senha: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Lock className="w-5 h-5" />
            Autenticação Necessária
          </DialogTitle>
        </DialogHeader>

        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 text-sm">
            Você está prestes a deletar esta {itemType}. Esta ação não pode ser desfeita.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pwd">Senha de Autorização (5 dígitos) *</Label>
            <Input
              id="pwd"
              type="password"
              maxLength="5"
              placeholder="00000"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 5))}
              className="text-center text-2xl tracking-widest font-mono"
            />
            <p className="text-xs text-slate-500">Apenas números</p>
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={loading || password.length !== 5}
            >
              {loading ? "Validando..." : "Deletar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}