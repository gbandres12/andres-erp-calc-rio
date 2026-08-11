import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Lock, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function SalePaymentDateEditDialog({ payment, saleId, open, onClose }) {
  const [step, setStep] = useState("auth"); // "auth" | "edit"
  const [password, setPassword] = useState("");
  const [newDate, setNewDate] = useState(payment?.payment_date || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!password || password.length !== 5) {
      setError("Senha deve ter exatamente 5 dígitos");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await base44.functions.invoke("validateDeletionPassword", {
        company_id: localStorage.getItem("selectedCompanyId"),
        password
      });
      if (result?.data?.success) {
        setStep("edit");
        setError("");
      } else {
        setError("Senha incorreta");
      }
    } catch (err) {
      setError(err?.message || "Senha incorreta");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newDate) {
      setError("Informe a nova data");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await base44.entities.SalePayment.update(payment.id, { payment_date: newDate });
      toast.success("Data do pagamento atualizada");
      queryClient.invalidateQueries({ queryKey: ["sale-payments-history", saleId] });
      handleClose();
    } catch (err) {
      setError(err?.message || "Erro ao atualizar data");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("auth");
    setPassword("");
    setError("");
    setNewDate(payment?.payment_date || "");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            {step === "auth" ? <Lock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            {step === "auth" ? "Autorização Necessária" : "Alterar Data do Pagamento"}
          </DialogTitle>
        </DialogHeader>

        {step === "auth" ? (
          <>
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                A alteração da data de um pagamento é restrita. Informe a senha de autorização.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pwd">Senha de Autorização (5 dígitos) *</Label>
                <Input
                  id="pwd"
                  type="password"
                  maxLength="5"
                  placeholder="00000"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
                <p className="text-xs text-slate-500">Apenas números</p>
              </div>

              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  disabled={loading || password.length !== 5}
                >
                  {loading ? "Validando..." : "Autorizar"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newDate">Nova data do pagamento *</Label>
              <Input
                id="newDate"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={loading}
              >
                <Save className="w-4 h-4" />
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}