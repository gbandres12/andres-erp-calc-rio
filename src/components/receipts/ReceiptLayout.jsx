import React from "react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68ea91a66a9614db4a82043d/0e678bbed_CALCARIOAMAZONIALOGO.png";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

// Layout único para recibos de pagamento e recebimento
export default function ReceiptLayout({ isIncome, number, amount, date, party, company, details = [], highlight, notes, width = "148mm", className }) {
  const accent = isIncome ? "#047857" : "#b91c1c";
  const title = isIncome ? "RECIBO DE RECEBIMENTO" : "COMPROVANTE DE PAGAMENTO";
  const big = { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 800, letterSpacing: "-0.5px", color: INK, lineHeight: 1.05 };
  const label = { fontSize: "7.5pt", fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase" };

  return (
    <div className={className} style={{ width, maxWidth: "100%", background: "#fff", color: INK, fontFamily: "Arial, Helvetica, sans-serif", padding: "10mm", boxSizing: "border-box", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "8px", borderBottom: `3px solid ${accent}` }}>
        <img src={LOGO_URL} alt="" style={{ height: "14mm", objectFit: "contain" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11pt", fontWeight: 800, color: accent, letterSpacing: "0.5px" }}>{title}</div>
          <div style={{ fontSize: "8.5pt", color: MUTED }}>{company?.name || "EMPRESA"}{company?.cnpj ? ` · CNPJ ${company.cnpj}` : ""}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", margin: "14px 0" }}>
        <div style={{ flex: "1 1 45%" }}>
          <div style={label}>Nº do documento</div>
          <div style={{ ...big, fontSize: "20pt" }}>{number}</div>
        </div>
        <div style={{ flex: "1 1 45%", textAlign: "right" }}>
          <div style={label}>Data</div>
          <div style={{ ...big, fontSize: "20pt" }}>{formatDate(date)}</div>
        </div>
      </div>

      <div style={{ background: accent, color: "#fff", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
        <div style={{ ...label, color: "rgba(255,255,255,0.8)" }}>{isIncome ? "Valor recebido" : "Valor pago"}</div>
        <div style={{ ...big, color: "#fff", fontSize: "30pt", marginTop: "4px" }}>{formatBRL(amount)}</div>
      </div>

      <div style={{ marginTop: "14px" }}>
        <div style={label}>{isIncome ? "Recebido de" : "Pago para"}</div>
        <div style={{ fontSize: "12pt", fontWeight: 700 }}>{party || "—"}</div>
      </div>

      {details.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px", fontSize: "10pt" }}>
          <tbody>
            {details.map(([k, v]) => (
              <tr key={k} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: "6px 0", color: MUTED }}>{k}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {highlight && (
        <div style={{ marginTop: "12px", border: `2px solid ${highlight.color}`, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
          <div style={label}>{highlight.label}</div>
          <div style={{ ...big, fontSize: "18pt", color: highlight.color }}>{highlight.value}</div>
          {highlight.note && <div style={{ fontSize: "8.5pt", fontWeight: 700, color: highlight.color, marginTop: "2px" }}>{highlight.note}</div>}
        </div>
      )}

      {notes && <div style={{ marginTop: "12px", fontSize: "9pt", color: MUTED, whiteSpace: "pre-wrap" }}><strong>Obs:</strong> {notes}</div>}

      <div style={{ marginTop: "22mm", textAlign: "center" }}>
        <div style={{ borderTop: `1px solid ${INK}`, width: "70%", margin: "0 auto", paddingTop: "4px", fontSize: "8.5pt" }}>Assinatura</div>
      </div>
      <div style={{ marginTop: "10px", textAlign: "center", fontSize: "7.5pt", color: MUTED }}>
        Emitido em {formatDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}