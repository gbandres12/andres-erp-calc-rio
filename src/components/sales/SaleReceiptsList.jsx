import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";

// Lista os pagamentos da venda para escolher qual recibo imprimir
export default function SaleReceiptsList({ sale, onSelect }) {
  const [payments, setPayments] = useState(null);

  useEffect(() => {
    base44.entities.SalePayment.filter({ sale_id: sale.id }, 'payment_date').then(setPayments);
  }, [sale.id]);

  if (!payments) return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  if (payments.length === 0) return <p className="text-xs text-slate-500">Nenhum pagamento registrado</p>;

  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {payments.map((p, i) => (
        <Button key={p.id} variant="outline" size="sm" className="w-full justify-between h-auto py-2" onClick={() => onSelect(p.id)}>
          <span className="flex items-center gap-2 text-left">
            <Printer className="w-3.5 h-3.5" />
            <span>Recibo {i + 1} · {formatDate(p.payment_date)}</span>
          </span>
          <span className="font-bold">{formatBRL(p.amount)}</span>
        </Button>
      ))}
    </div>
  );
}