import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDate, getTodayDate } from "@/components/utils/formatters";
import { toast } from "sonner";
import BranchBadge from "@/components/BranchBadge";

const empty = {
  client_id: "", client_name: "", date: getTodayDate(),
  limestone_tons: 0, limestone_unit_value: 0,
  corn_tons: 0, corn_unit_value: 0,
  sale_id: "", sale_reference: "", notes: ""
};

export function BarterDialog({ open, onOpenChange, companyId, onSaved }) {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [sales, setSales] = useState([]);

  useEffect(() => {
    if (open && companyId) {
      base44.entities.Contact.filter({ company_id: companyId, is_active: true })
        .then(list => setContacts(list.filter(c => c.type === "cliente" || c.type === "ambos")))
        .catch(() => setContacts([]));
    }
  }, [open, companyId]);

  useEffect(() => {
    if (form.client_id && companyId) {
      base44.entities.Sale.filter({ client_id: form.client_id, company_id: companyId }, "-sale_date", 100)
        .then(list => setSales(list.filter(s => ["faturada", "concluida"].includes(s.status))))
        .catch(() => setSales([]));
    } else {
      setSales([]);
    }
  }, [form.client_id, companyId]);

  const limestoneTotal = (form.limestone_tons || 0) * (form.limestone_unit_value || 0);
  const cornTotal = (form.corn_tons || 0) * (form.corn_unit_value || 0);
  const balance = limestoneTotal - cornTotal;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleSelectClient = (id) => {
    const c = contacts.find(x => x.id === id);
    setForm(p => ({ ...p, client_id: id, client_name: c?.name || "", sale_id: "", sale_reference: "" }));
    setClientSearch("");
  };

  const handleSelectSale = (id) => {
    const s = sales.find(x => x.id === id);
    setForm(p => ({ ...p, sale_id: id, sale_reference: s?.reference || "" }));
  };

  const handleSave = async () => {
    if (!form.client_name) { toast.error("Selecione o cliente"); return; }
    if (!form.date) { toast.error("Informe a data"); return; }
    setSaving(true);
    try {
      const existing = await base44.entities.Barter.filter({ company_id: companyId }, "-created_date", 200);
      const maxNum = existing.reduce((m, b) => {
        const n = parseInt((b.reference || "").replace(/\D/g, "")) || 0;
        return Math.max(m, n);
      }, 0);
      const reference = `PERM-${String(maxNum + 1).padStart(5, "0")}`;
      const status = Math.abs(balance) < 0.01 ? "compensado" : (balance > 0 ? "aberto" : "parcial");
      await base44.entities.Barter.create({ ...form, reference, company_id: companyId, status });
      toast.success("Permuta registrada");
      onSaved?.();
      onOpenChange(false);
      setForm(empty);
    } catch (e) {
      toast.error("Erro ao salvar permuta");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🌽 Registrar Permuta (Calcário × Milho)
          </DialogTitle>
        </DialogHeader>
        <BranchBadge className="mb-2" />

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            {form.client_id ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border rounded-md bg-slate-50">
                <span className="font-medium text-slate-800">{form.client_name}</span>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => { setForm(p => ({ ...p, client_id: "", client_name: "", sale_id: "", sale_reference: "" })); setClientSearch(""); }}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <Input placeholder="Buscar cliente..." value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)} />
                {clientSearch && (
                  <div className="max-h-44 overflow-auto border rounded-md bg-white divide-y">
                    {filteredContacts.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-400">Nenhum cliente encontrado</div>
                    ) : filteredContacts.slice(0, 20).map(c => (
                      <button key={c.id} type="button" onClick={() => handleSelectClient(c.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {form.client_id && sales.length > 0 && (
            <div className="space-y-1.5">
              <Label>Vincular à venda (opcional)</Label>
              <Select value={form.sale_id} onValueChange={handleSelectSale}>
                <SelectTrigger><SelectValue placeholder="Sem venda vinculada" /></SelectTrigger>
                <SelectContent>
                  {sales.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.reference} — {formatDate(s.sale_date)} — {formatBRL(s.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.sale_reference && (
                <p className="text-xs text-slate-500">Venda vinculada: <strong>{form.sale_reference}</strong></p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="col-span-2 text-sm font-semibold text-blue-800">Saída de Calcário</div>
            <div className="space-y-1">
              <Label className="text-xs">Toneladas</Label>
              <Input type="number" step="0.01" value={form.limestone_tons || ""}
                onChange={e => set("limestone_tons", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">R$ / Ton</Label>
              <Input type="number" step="0.01" value={form.limestone_unit_value || ""}
                onChange={e => set("limestone_unit_value", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="col-span-2 text-right text-sm text-blue-700 font-medium">
              Total calcário: {formatBRL(limestoneTotal)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <div className="col-span-2 text-sm font-semibold text-amber-800">Entrada de Milho (pátio)</div>
            <div className="space-y-1">
              <Label className="text-xs">Toneladas</Label>
              <Input type="number" step="0.01" value={form.corn_tons || ""}
                onChange={e => set("corn_tons", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">R$ / Ton</Label>
              <Input type="number" step="0.01" value={form.corn_unit_value || ""}
                onChange={e => set("corn_unit_value", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="col-span-2 text-right text-sm text-amber-700 font-medium">
              Total milho: {formatBRL(cornTotal)}
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-100">
            <span className="text-sm font-medium text-slate-700">Saldo da permuta</span>
            <span className={`font-bold ${balance >= 0 ? "text-blue-700" : "text-amber-700"}`}>
              {formatBRL(balance)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes || ""}
              onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Registrar Permuta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}