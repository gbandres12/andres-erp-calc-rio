import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS, OPERATION_TYPES } from "@/components/fiscal/paymentMethods";

const emptyTemplate = {
  name: "", operation_type: "venda", document_type: "nfe", nature_operation: "",
  payment_method: "", cfop_interno: "", cfop_interestadual: "", notes: ""
};

export default function FiscalTemplateDialog({ open, onOpenChange, companyId }) {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["fiscal_templates", companyId],
    queryFn: () => base44.entities.FiscalTemplate.filter({ company_id: companyId }),
    enabled: open && !!companyId
  });

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTemplate);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setEditing(null); setForm(emptyTemplate); } }, [open]);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const startEdit = (t) => {
    const { id, created_date, updated_date, created_by_id, ...data } = t;
    setEditing(t); setForm({ ...emptyTemplate, ...data });
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do modelo"); return; }
    setSaving(true);
    try {
      const data = { ...form, company_id: companyId };
      if (editing) await base44.entities.FiscalTemplate.update(editing.id, data);
      else await base44.entities.FiscalTemplate.create(data);
      toast.success(editing ? "Modelo atualizado!" : "Modelo criado!");
      queryClient.invalidateQueries({ queryKey: ["fiscal_templates", companyId] });
      setEditing(null); setForm(emptyTemplate);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Excluir o modelo "${t.name}"?`)) return;
    await base44.entities.FiscalTemplate.delete(t.id);
    toast.success("Modelo excluído");
    queryClient.invalidateQueries({ queryKey: ["fiscal_templates", companyId] });
    if (editing?.id === t.id) { setEditing(null); setForm(emptyTemplate); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modelos de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-violet-600" /></div>}
          {!isLoading && templates.length === 0 && (
            <p className="text-sm text-slate-500 py-2">Nenhum modelo criado ainda. Crie o primeiro abaixo.</p>
          )}
          {templates.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {OPERATION_TYPES.find(o => o.value === t.operation_type)?.label || t.operation_type}
                  {t.nature_operation ? ` · ${t.nature_operation}` : ""}
                  {t.cfop_interno ? ` · CFOP ${t.cfop_interno}` : ""}
                  {t.cfop_interestadual ? ` / ${t.cfop_interestadual}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => startEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => remove(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">{editing ? "Editar modelo" : "Novo modelo"}</h4>
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setForm(emptyTemplate); }}>Cancelar edição</Button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome do Modelo</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Ex: Transferência de Estoque" />
            </div>
            <div className="space-y-1">
              <Label>Tipo de Operação</Label>
              <Select value={form.operation_type} onValueChange={v => setField("operation_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de Documento</Label>
              <Select value={form.document_type} onValueChange={v => setField("document_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nfe">NF-e</SelectItem>
                  <SelectItem value="nfce">NFC-e</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Forma de Pagamento</Label>
              <Select value={form.payment_method || "none"} onValueChange={v => setField("payment_method", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manter atual</SelectItem>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Natureza da Operação</Label>
              <Input value={form.nature_operation} onChange={e => setField("nature_operation", e.target.value)} placeholder="Ex: Transferência de mercadoria" />
            </div>
            <div className="space-y-1">
              <Label>CFOP Interno (próprio estado)</Label>
              <Input value={form.cfop_interno} onChange={e => setField("cfop_interno", e.target.value.replace(/\D/g, ""))} placeholder="Vazio = usa o do produto" maxLength={4} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>CFOP Interestadual</Label>
              <Input value={form.cfop_interestadual} onChange={e => setField("cfop_interestadual", e.target.value.replace(/\D/g, ""))} placeholder="Vazio = usa o do produto" maxLength={4} className="font-mono" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Observação ao aplicar</Label>
              <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} placeholder="Texto acrescentado às informações complementares da nota (opcional)" />
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            {editing ? "Salvar alterações" : "Criar modelo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}