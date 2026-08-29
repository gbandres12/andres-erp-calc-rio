import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function EditAuthDialog({ open, onClose, onSuccess, selectedCompanyId }) {
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await base44.functions.invoke("validateDeletionPassword", {
        company_id: selectedCompanyId,
        password: passwordInput,
      });
      if (result?.data?.success) {
        setPasswordInput("");
        toast.success("Acesso autorizado!");
        onSuccess?.();
        onClose?.();
      } else {
        toast.error("Senha incorreta!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "Senha incorreta!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Autorização Necessária
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Senha de Administrador</Label>
            <Input
              type="password"
              placeholder="Digite a senha..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Validando..." : "Confirmar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
