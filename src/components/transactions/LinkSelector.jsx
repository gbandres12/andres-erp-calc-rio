import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Link2, Search, X, ShoppingCart, FileText } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";
import { saleOpenBalance, round2 } from "@/utils/saleFinance";
import useSelectedCompanyId from "@/hooks/useSelectedCompanyId";

const titleOpen = (t) => round2((t.amount || 0) - (t.paid_amount || 0) - (t.discount || 0));

// Vínculo opcional: quita uma venda ou um título em aberto em vez de criar lançamento solto.
export default function LinkSelector({ formData, setFormData, transactions }) {
  const companyId = useSelectedCompanyId();
  const isIncome = formData.type === "receita";
  const [open, setOpen] = React.useState(false);
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

  const selSale = sales.find(s => s.id === formData.link_sale_id);
  const selTx = titles.find(t => t.id === formData.link_transaction_id);
  const pick = (v) => { onChange(v); setOpen(false); };

  return (
    <div className="space-y-2">
      <Label>Vincular a (opcional)</Label>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full justify-between h-auto py-2.5 font-normal">
        <span className="flex items-center gap-2 min-w-0 text-left">
          <Link2 className="w-4 h-4 text-violet-600 flex-shrink-0" />
          <span className="truncate">
            {selSale ? `Venda ${selSale.reference} · ${selSale.client_name}` : selTx ? selTx.description : "Sem vínculo (lançamento avulso)"}
          </span>
        </span>
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar por cliente, venda ou descrição..." />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="sem vinculo avulso" onSelect={() => pick("none")}>
              <X className="w-4 h-4 mr-2 text-slate-400" /> Sem vínculo (lançamento avulso)
            </CommandItem>
          </CommandGroup>
          {isIncome && sales.length > 0 && (
            <CommandGroup heading="Vendas em aberto">
              {sales.map(s => (
                <CommandItem key={s.id} value={`${s.reference} ${s.client_name}`} onSelect={() => pick(`sale:${s.id}`)} className="flex items-center gap-3 py-2.5">
                  <ShoppingCart className="w-4 h-4 text-violet-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.client_name}</p>
                    <p className="text-xs text-slate-500">{s.reference} · {formatDate(s.sale_date)}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700 whitespace-nowrap">{formatBRL(saleOpenBalance(s))}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {titles.length > 0 && (
            <CommandGroup heading={isIncome ? "Contas a receber" : "Contas a pagar"}>
              {titles.map(t => (
                <CommandItem key={t.id} value={`${t.description} ${t.contact_name || ""} ${t.id}`} onSelect={() => pick(`tx:${t.id}`)} className="flex items-center gap-3 py-2.5">
                  <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.description}</p>
                    <p className="text-xs text-slate-500">{t.contact_name ? `${t.contact_name} · ` : ""}venc. {formatDate(t.due_date)}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700 whitespace-nowrap">{formatBRL(titleOpen(t))}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      {value !== "none" && <p className="text-xs text-slate-500">A baixa será feita no item vinculado — não gera lançamento duplicado.</p>}
    </div>
  );
}