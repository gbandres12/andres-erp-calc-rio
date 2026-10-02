import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";
import ReceiptLayout from "@/components/receipts/ReceiptLayout";

const METHODS = { dinheiro: "Dinheiro", pix: "PIX", cartao_credito: "Cartão de Crédito", cartao_debito: "Cartão de Débito", transferencia: "Transferência", cheque: "Cheque" };

export default function PaymentReceipt({ payment, sale, previousPayments = [] }) {
  const totalPaidBefore = previousPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const saldoAnterior = sale.total - totalPaidBefore;
  const saldoRestante = saldoAnterior - payment.amount;
  const quitado = saldoRestante <= 0.01;
  const number = `${sale.reference}${payment.id ? `-${payment.id.slice(-4).toUpperCase()}` : ""}`;

  const details = [
    ["Venda", sale.reference],
    ["Forma", METHODS[payment.payment_method] || payment.payment_method || "—"],
    ["Total da venda", formatBRL(sale.total)],
    ["Saldo anterior", formatBRL(saldoAnterior)],
    payment.discount > 0 && ["Desconto", formatBRL(payment.discount)],
  ].filter(Boolean);

  return (
    <>
      <div className="no-print mb-4">
        <Button onClick={() => window.print()} className="w-full">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Recibo de Pagamento
        </Button>
      </div>

      <ReceiptLayout
        isIncome
        number={number}
        amount={payment.amount}
        date={payment.payment_date}
        party={sale.client_name}
        company={{ name: sale.company_name, cnpj: sale.company_cnpj }}
        details={details}
        highlight={{
          label: "Saldo restante",
          value: formatBRL(Math.max(saldoRestante, 0)),
          color: quitado ? "#047857" : "#b45309",
          note: quitado ? "VENDA QUITADA" : "Pagamento restante em aberto",
        }}
        notes={payment.notes}
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page { size: A5; margin: 0; }
        }
      `}</style>
    </>
  );
}