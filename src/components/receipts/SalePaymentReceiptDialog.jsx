import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

const METHOD_LABELS = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  transferencia: "Transferência",
  cheque: "Cheque",
  boleto: "Boleto",
};

const INK = "#1e293b";
const MUTED = "#64748b";
const SOFT = "#94a3b8";
const LINE = "#e2e8f0";

// Recibo de pagamento/abatimento de venda — visual A4 elegante
export default function SalePaymentReceiptDialog({ sale, payment, kind, totals, open, onClose }) {
  const [company, setCompany] = useState(null);
  const [client, setClient] = useState(null);
  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    if (!open || !sale || !payment) return;
    (async () => {
      try { setCompany(await base44.entities.Company.get(sale.company_id)); } catch { setCompany(null); }
      try { setClient(sale.client_id ? await base44.entities.Contact.get(sale.client_id) : null); } catch { setClient(null); }
      try {
        setAccountName(payment.account_id ? (await base44.entities.FinancialAccount.get(payment.account_id))?.name || "" : "");
      } catch { setAccountName(""); }
    })();
  }, [open, sale?.id, payment?.id]);

  if (!sale || !payment) return null;

  const isAbatimento = kind === 'abatimento';
  const valor = isAbatimento ? (payment.discount || 0) : (payment.amount || 0);
  const clientName = client?.name || sale.client_name || '—';
  const clientDoc = client?.document || '';
  const number = `REC-${String(payment.payment_date || '').slice(0, 4) || new Date().getFullYear()}-${(payment.id || '').slice(-4).toUpperCase()}`;

  const handlePrint = () => {
    const node = document.querySelector('.sale-payment-receipt');
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!node || !win) { window.print(); return; }
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${number}</title>` +
      `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>` +
      `</head><body>${node.outerHTML}</body></html>`
    );
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 600);
  };

  const boxLabel = { fontSize: "8pt", fontWeight: 700, letterSpacing: "1.2px", color: MUTED, textTransform: "uppercase" };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isAbatimento ? 'Recibo de Abatimento' : 'Recibo de Pagamento'} — {sale.reference}</DialogTitle>
        </DialogHeader>

        <div className="no-print flex justify-end mb-2">
          <Button onClick={handlePrint} className="gap-2 bg-slate-900 hover:bg-slate-800 text-white">
            <Printer className="w-4 h-4" /> Imprimir Recibo
          </Button>
        </div>

        <div className="bg-slate-100 rounded-xl p-4 overflow-x-auto">
          <div
            className="sale-payment-receipt"
            style={{ width: "180mm", maxWidth: "100%", background: "#fff", color: INK, fontFamily: "Arial, Helvetica, sans-serif", padding: "12mm", boxSizing: "border-box", margin: "0 auto" }}
          >
            {/* Cabeçalho: empresa + número do recibo */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "15pt", fontWeight: 800, color: INK, letterSpacing: "-0.3px" }}>{company?.name || "—"}</div>
                {company?.cnpj && <div style={{ fontSize: "8.5pt", color: MUTED, marginTop: "3px" }}>CNPJ: {company.cnpj}</div>}
                {company?.address && <div style={{ fontSize: "8.5pt", color: MUTED, marginTop: "2px" }}>{company.address}</div>}
                {company?.phone && <div style={{ fontSize: "8.5pt", color: MUTED, marginTop: "2px" }}>Contato: {company.phone}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "8.5pt", color: SOFT, fontWeight: 700, letterSpacing: "1px" }}>RECIBO Nº</div>
                <div style={{ fontSize: "11pt", fontWeight: 800, color: INK }}>{number}</div>
                <div style={{ fontSize: "8.5pt", color: MUTED, marginTop: "3px" }}>Data de Emissão: <strong>{formatDate(payment.payment_date)}</strong></div>
              </div>
            </div>
            <div style={{ borderTop: `3px solid ${INK}`, margin: "12px 0 18px" }} />

            {/* Valor + forma de pagamento */}
            <div style={{ border: `1.5px solid ${LINE}`, borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div>
                <div style={boxLabel}>{isAbatimento ? "Valor Abatido" : "Valor Recebido"}</div>
                <div style={{ fontSize: "22pt", fontWeight: 800, color: isAbatimento ? "#7c3aed" : "#16a34a", letterSpacing: "-0.5px" }}>
                  {formatBRL(valor)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={boxLabel}>Forma de Pagamento</div>
                <div style={{ fontSize: "13pt", fontWeight: 800, color: INK }}>{METHOD_LABELS[payment.payment_method] || payment.payment_method || "—"}</div>
                {accountName && <div style={{ fontSize: "8.5pt", color: MUTED, marginTop: "3px" }}>Conta: {accountName}</div>}
              </div>
            </div>

            {/* Declaração */}
            <div style={{ border: `1.5px solid ${LINE}`, borderRadius: "12px", padding: "16px", marginTop: "12px", fontSize: "10pt", lineHeight: 1.7 }}>
              {isAbatimento ? (
                <>Concedemos a <strong>{clientName}</strong>{clientDoc ? <> (Inscrito no CPF/CNPJ sob o nº <strong>{clientDoc}</strong>)</> : null}, o abatimento de <strong>{formatBRL(valor)}</strong>, referente à <strong>Venda nº {sale.reference}</strong>.</>
              ) : (
                <>Recebemos de <strong>{clientName}</strong>{clientDoc ? <> (Inscrito no CPF/CNPJ sob o nº <strong>{clientDoc}</strong>)</> : null}, a quantia de <strong>{formatBRL(valor)}</strong>, referente a <strong>Pagamento da Venda nº {sale.reference}</strong>.</>
              )}
            </div>

            {/* Resumo */}
            <div style={{ border: `1.5px solid ${LINE}`, borderRadius: "12px", padding: "16px", marginTop: "12px", display: "flex", justifyContent: "space-around", textAlign: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ minWidth: "120px" }}>
                <div style={boxLabel}>Total da Venda</div>
                <div style={{ fontSize: "12pt", fontWeight: 800, color: INK, marginTop: "4px" }}>{formatBRL(sale.total || 0)}</div>
              </div>
              <div style={{ minWidth: "120px" }}>
                <div style={boxLabel}>{isAbatimento ? "Total Abatido" : "Total Pago"}</div>
                <div style={{ fontSize: "12pt", fontWeight: 800, color: isAbatimento ? "#7c3aed" : "#16a34a", marginTop: "4px" }}>
                  {formatBRL(isAbatimento ? (totals?.totalAbatimento || valor) : (totals?.totalPago || valor))}
                </div>
              </div>
              <div style={{ minWidth: "120px" }}>
                <div style={boxLabel}>Saldo Devedor Restante</div>
                <div style={{ fontSize: "12pt", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>{formatBRL(sale.remaining_amount || 0)}</div>
              </div>
            </div>

            {/* Assinaturas */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "40px", marginTop: "36px", padding: "0 12px" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #334155", paddingTop: "6px", fontSize: "9pt", fontWeight: 800, color: INK }}>
                  {String(clientName).toUpperCase()}
                </div>
                <div style={{ fontSize: "8pt", color: MUTED, letterSpacing: "1px", marginTop: "3px" }}>ASSINATURA DO PAGADOR</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #334155", paddingTop: "6px", fontSize: "9pt", fontWeight: 800, color: INK }}>
                  {String(company?.name || "").toUpperCase()}
                </div>
                <div style={{ fontSize: "8pt", color: MUTED, letterSpacing: "1px", marginTop: "3px" }}>RECEBIDO POR: SETOR FINANCEIRO / CAIXA</div>
              </div>
            </div>

            {/* Rodapé */}
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginTop: "30px", paddingTop: "12px", borderTop: `1px solid ${LINE}`, fontSize: "8.5pt", color: MUTED }}>
              <span>SISTEMA ANDRES ERP CALCÁRIO • COMPROVANTE EMITIDO ELETRONICAMENTE</span>
              <span>{formatDateTime(new Date().toISOString())}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}