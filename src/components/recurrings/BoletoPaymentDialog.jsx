import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, ScanLine } from "lucide-react";
import { toast } from "sonner";

const emptyPayment = { description: "", amount: "", due_date: "", category: "" };

export default function BoletoPaymentDialog({ companyId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [payments, setPayments] = useState([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const readDocument = async () => {
    if (!file) return toast.error("Selecione o boleto ou a nota em PDF");
    setReading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            supplier_name: { type: "string" },
            category: { type: "string" },
            amount: { type: "number" },
            due_date: { type: "string", format: "date" },
            payments: { type: "array", items: { type: "object", properties: { description: { type: "string" }, amount: { type: "number" }, due_date: { type: "string", format: "date" } } } }
          }
        }
      });
      if (result.status !== "success") throw new Error(result.details || "Não foi possível ler o documento");
      const data = Array.isArray(result.output) ? result.output[0] : result.output;
      const extracted = data.payments?.length ? data.payments : [{ description: data.description || data.supplier_name || "", amount: data.amount || "", due_date: data.due_date || "", category: data.category || "" }];
      setFileUrl(file_url);
      setPayments(extracted.map(item => ({ ...emptyPayment, ...item, amount: item.amount ?? "" })));
      toast.success("Dados identificados. Revise os campos antes de programar.");
    } catch (error) {
      toast.error(error.message || "Não foi possível ler o documento");
    } finally {
      setReading(false);
    }
  };

  const updatePayment = (index, field, value) => setPayments(current => current.map((payment, i) => i === index ? { ...payment, [field]: value } : payment));

  const savePayments = async () => {
    if (!payments.length || payments.some(item => !item.description || !item.amount || !item.due_date)) return toast.error("Preencha descrição, valor e vencimento de cada pagamento");
    setSaving(true);
    try {
      await base44.entities.Transaction.bulkCreate(payments.map(item => ({
        description: item.description,
        amount: Number(item.amount),
        original_amount: Number(item.amount),
        type: "despesa",
        category: item.category || "Despesas gerais",
        status: "pendente",
        due_date: item.due_date,
        company_id: companyId,
        attachment_url: fileUrl,
        notes: "Programado a partir de boleto ou nota em PDF"
      })));
      onCreated();
      setOpen(false);
      setFile(null);
      setFileUrl("");
      setPayments([]);
      toast.success("Pagamentos programados como pendentes no financeiro.");
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline"><FileUp className="w-4 h-4 mr-2" />Ler boleto ou nota</Button></DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Programar pagamentos por PDF</DialogTitle></DialogHeader>
      {!payments.length ? <div className="space-y-4 py-2">
        <p className="text-sm text-slate-500">Envie um boleto ou nota fiscal. A leitura sugere os valores e vencimentos; os campos sem identificação ficam para você preencher.</p>
        <div className="space-y-2"><Label>Arquivo PDF</Label><Input type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} /></div>
        <div className="flex justify-end"><Button onClick={readDocument} disabled={!file || reading}>{reading ? <><ScanLine className="w-4 h-4 mr-2 animate-pulse" />Lendo...</> : "Ler documento"}</Button></div>
      </div> : <div className="space-y-4">
        {payments.map((payment, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border p-3">
          <div className="sm:col-span-3"><Label>Descrição</Label><Input value={payment.description} onChange={event => updatePayment(index, "description", event.target.value)} placeholder="Fornecedor ou referência" /></div>
          <div><Label>Valor</Label><Input type="number" step="0.01" value={payment.amount} onChange={event => updatePayment(index, "amount", event.target.value)} /></div>
          <div><Label>Vencimento</Label><Input type="date" value={payment.due_date} onChange={event => updatePayment(index, "due_date", event.target.value)} /></div>
          <div><Label>Categoria</Label><Input value={payment.category} onChange={event => updatePayment(index, "category", event.target.value)} placeholder="Opcional" /></div>
        </div>)}
        <Button variant="outline" onClick={() => setPayments(current => [...current, emptyPayment])}>Adicionar pagamento</Button>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPayments([])}>Ler outro arquivo</Button><Button onClick={savePayments} disabled={saving}>{saving ? "Programando..." : "Programar pagamentos"}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}