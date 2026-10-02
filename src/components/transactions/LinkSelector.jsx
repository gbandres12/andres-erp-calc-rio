import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDate } from "@/components/utils/formatters";
import { saleOpenBalance, round2 } from "@/utils/saleFinance";
import useSelectedCompanyId from "@/hooks/useSelectedCompanyId";

const titleOpen = (t) => round2((t.amount || 0) - (t.paid_amount || 0) - (t.discount || 0));

// Vínculo opcional: quita uma venda ou um título em aberto em vez de criar lançamento solto.
export default function LinkSelector({ formData, setFormData, transactions }) {
  const companyId = useSelectedCompanyId();
  const isIncome = formData.type === "receita";
  const { data: sales = [] } = useQuery({
    queryKey: ["open-sales-link", companyId],
    queryFn: () => base44.entities.Sale.filter({ company_id: companyId, payment_status: { $in: ["pendente", "parcial"] }, status: { $ne: "cancelada" } }, "-sale_date", 300),
    enabled: isIncome && !!companyId,
  });
  const titles = (transactions || []).filter(t => t.type === formData.type && ["pendente", "parcial", "atrasado"].includes(t.status) && titleOpen(t) > 0.01);

  const value = formData.link_sale_id ? `sale:${formData.link_sale_id}` : formData.link_transaction_id ? `tx:${formData.link_transaction_id}` : "none";

  const onChange = (v) => {
    const [kind, id] = v.split(":");
    const base = { link_sale_id: "", link_transaction_id: "" };
    if (kind === "sale") {
      const s = sales.find(x => x.id === id);
      const open = saleOpenBalance(s);
      setFormData(prev => ({ ...prev, ...base, link_sale_id: id, original_amount: open, amount: open, discount_value: 0,
        description: `${s.reference} - Recebimento`, contact_id: s.client_id || prev.contact_id, category: prev.category || "Vendas" }));
    } else if (kind === "tx") {
      const t = titles.find(x => x.id === id);
      const open = titleOpen(t);
      setFormData(prev => ({ ...prev, ...base, link_transaction_id: id, original_amount: open, amount: open, discount_value: 0,
        description: t.description, contact_id: t.contact_id || prev.contact_id, category: t.category || prev.category, cost_center: t.cost_center || prev.cost_center }));
    } else setFormData(prev => ({ ...prev, ...base }));
  };

  return (
    <div className="space-y-2">
      <Label>Vincular a (opcional)</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem vínculo (lançamento avulso)</SelectItem>
          {isIncome && sales.map(s => (
            <SelectItem key={s.id} value={`sale:${s.id}`}>Venda {s.reference} · {s.client_name} · falta {formatBRL(saleOpenBalance(s))}</SelectItem>
          ))}
          {titles.map(t => (
            <SelectItem key={t.id} value={`tx:${t.id}`}>{isIncome ? "A receber" : "A pagar"}: {t.description} · venc. {formatDate(t.due_date)} · falta {formatBRL(titleOpen(t))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value !== "none" && <p className="text-xs text-slate-500">A baixa será feita no item vinculado — não gera lançamento duplicado.</p>}
    </div>
  );
}