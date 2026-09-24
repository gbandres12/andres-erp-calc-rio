import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, User, Building2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import useCepLookup from "@/hooks/useCepLookup";
import { maskCpfCnpj } from "@/components/fiscal/cpfCnpj";

const EMPTY_CLIENT = {
  name: "", document: "", ie: "", email: "", phone: "",
  cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: ""
};

export default function NewClientDialog({ open, onOpenChange, companyId, onClientCreated }) {
  const [personType, setPersonType] = useState("pf");
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState(EMPTY_CLIENT);

  const setField = (field, value) => setClient(prev => ({ ...prev, [field]: value }));

  const { cepLoading, handleCepChange } = useCepLookup((data) => {
    setClient(prev => ({
      ...prev,
      logradouro: data.logradouro || prev.logradouro || "",
      bairro: data.bairro || prev.bairro || "",
      municipio: data.localidade || prev.municipio || "",
      uf: data.uf || prev.uf || ""
    }));
  });

  const isPj = personType === "pj";
  const docDigits = (client.document || "").replace(/\D/g, "");
  const isValid = (client.name || "").trim().length > 0 && docDigits.length === (isPj ? 14 : 11);

  const switchType = (type) => {
    if (type === personType) return;
    setPersonType(type);
    setClient(prev => ({ ...prev, document: "", ie: "" }));
  };

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const address = [client.logradouro, client.numero, client.bairro]
        .map(p => (p || "").trim()).filter(Boolean).join(", ");
      const created = await base44.entities.Contact.create({
        type: "cliente",
        status: "cliente",
        name: (client.name || "").trim(),
        document: docDigits,
        email: (client.email || "").trim(),
        phone: (client.phone || "").trim(),
        address,
        city: (client.municipio || "").trim(),
        state: (client.uf || "").toUpperCase(),
        zip_code: client.cep || "",
        ...(isPj && (client.ie || "").trim() ? { ie: (client.ie || "").trim() } : {}),
        company_id: companyId
      });
      toast.success(`Cliente "${created.name}" cadastrado!`);
      onOpenChange(false);
      setClient(EMPTY_CLIENT);
      setPersonType("pf");
      onClientCreated(created);
    } catch (e) {
      toast.error(e.message || "Erro ao cadastrar cliente");
    } finally {
      setSaving(false);
    }
  };

  const typeButton = (type, Icon, label) => (
    <button
      type="button"
      onClick={() => switchType(type)}
      className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors ${
        personType === type
          ? "border-violet-500 bg-violet-50 text-violet-700"
          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Cliente</DialogTitle>
          <DialogDescription>
            Cadastre e use o cliente nesta nota sem sair da emissão.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {typeButton("pf", User, "Pessoa Física")}
          {typeButton("pj", Building2, "Pessoa Jurídica")}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="nc-name">{isPj ? "Razão Social *" : "Nome Completo *"}</Label>
            <Input id="nc-name" value={client.name || ""} onChange={e => setField("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-document">{isPj ? "CNPJ *" : "CPF *"}</Label>
            <Input
              id="nc-document"
              value={client.document || ""}
              onChange={e => setField("document", maskCpfCnpj(e.target.value))}
              placeholder={isPj ? "00.000.000/0000-00" : "000.000.000-00"}
              inputMode="numeric"
            />
          </div>
          {isPj && (
            <div className="space-y-1">
              <Label htmlFor="nc-ie">Inscrição Estadual</Label>
              <Input id="nc-ie" value={client.ie || ""} onChange={e => setField("ie", e.target.value)} placeholder="ISENTO" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="nc-email">Email</Label>
            <Input id="nc-email" type="email" value={client.email || ""} onChange={e => setField("email", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-phone">Telefone</Label>
            <Input id="nc-phone" value={client.phone || ""} onChange={e => setField("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-cep">CEP {cepLoading && <Loader2 className="w-3 h-3 inline animate-spin text-violet-600" />}</Label>
            <Input
              id="nc-cep"
              value={client.cep || ""}
              onChange={e => setField("cep", handleCepChange(e.target.value))}
              placeholder="00000-000"
              maxLength={9}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-numero">Número</Label>
            <Input id="nc-numero" value={client.numero || ""} onChange={e => setField("numero", e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="nc-logradouro">Logradouro</Label>
            <Input id="nc-logradouro" value={client.logradouro || ""} onChange={e => setField("logradouro", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-bairro">Bairro</Label>
            <Input id="nc-bairro" value={client.bairro || ""} onChange={e => setField("bairro", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-municipio">Município</Label>
            <Input id="nc-municipio" value={client.municipio || ""} onChange={e => setField("municipio", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-uf">UF</Label>
            <Input id="nc-uf" maxLength={2} value={client.uf || ""} onChange={e => setField("uf", e.target.value.toUpperCase())} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!isValid || saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            {saving ? "Cadastrando..." : "Cadastrar e usar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}