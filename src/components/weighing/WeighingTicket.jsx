import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const formatDateTime = (dt) => {
  if (!dt) return "__/__/____ __:__";
  const d = new Date(dt);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${min}`;
};

// Converte kg para toneladas com 3 casas decimais
const formatTon = (kg) => {
  if (kg === null || kg === undefined || isNaN(kg)) return "-";
  const tons = kg / 1000;
  return tons.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " t";
};

function TicketVia({ weighing, company, label }) {
  return (
    <div style={{ width: "49%", border: "1px solid #555", fontFamily: "Arial, sans-serif", fontSize: 11 }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #555", padding: "6px 8px", textAlign: "center", background: "#f0f0f0" }}>
        <div style={{ fontWeight: "bold", fontSize: 13 }}>
          {company?.name?.toUpperCase() || "EMPRESA"} — TICKET DE PESAGEM
        </div>
        {company?.address && <div style={{ fontSize: 10 }}>{company.address}{company.city ? `, ${company.city}/${company.state}` : ""}</div>}
        {company?.phone && <div style={{ fontSize: 10 }}>Fone: {company.phone}</div>}
        <div style={{ marginTop: 4, fontWeight: "bold", color: "#555", fontSize: 10 }}>{label}</div>
      </div>

      {/* Ticket / Ref */}
      <div style={{ display: "flex", borderBottom: "1px solid #ccc", padding: "4px 8px", gap: 12 }}>
        <div><span style={{ fontWeight: "bold" }}>Ticket: </span>{weighing?.ticket_number || weighing?.reference}</div>
        <div><span style={{ fontWeight: "bold" }}>Ref: </span>{weighing?.reference}</div>
        <div><span style={{ fontWeight: "bold" }}>Data: </span>{formatDateTime(weighing?.tare_datetime || weighing?.entry_time || weighing?.created_date)}</div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #ccc" }}>
        {/* Left col */}
        <div style={{ padding: "4px 8px", borderRight: "1px solid #ccc" }}>
          <Row label="Cliente" value={weighing?.client_name} />
          <Row label="Transportador" value={weighing?.transporter || weighing?.driver_name} />
          <Row label="Motorista" value={weighing?.driver_name} />
          <Row label="Produto" value={weighing?.product} bold />
          <Row label="Origem" value={weighing?.origin} />
          <Row label="Destino" value={weighing?.destination} />
        </div>
        {/* Right col */}
        <div style={{ padding: "4px 8px" }}>
          <Row label="Placa Cavalinho" value={weighing?.vehicle_plate} />
          <Row label="Placa 1º Reboque" value={weighing?.vehicle_plate2} />
          <Row label="Placa 2º Reboque" value={weighing?.vehicle_plate3} />
          <div style={{ marginTop: 8, borderTop: "1px solid #ccc", paddingTop: 8 }}>
            <WeightRow label="Tara" value={formatTon(weighing?.tare)} />
            <WeightRow label="Bruto" value={formatTon(weighing?.gross)} />
            <WeightRow
              label="Líquido"
              value={formatTon(weighing?.net)}
              highlight
            />
          </div>
          {weighing?.operator && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>Operador: {weighing.operator}</div>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 8px 6px", gap: 8 }}>
        <SigLine label="Emitente" />
        <SigLine label="Motorista" />
        <SigLine label="Fiscal de Operação" />
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: "flex", marginBottom: 3, alignItems: "baseline", gap: 4 }}>
      <span style={{ minWidth: 90, fontWeight: "bold", fontSize: 10, flexShrink: 0 }}>{label}:</span>
      <span style={{ flex: 1, borderBottom: "1px solid #aaa", minWidth: 40, fontWeight: bold ? "bold" : "normal", paddingBottom: 1 }}>
        {value || ""}
      </span>
    </div>
  );
}

function WeightRow({ label, value, highlight }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: highlight ? "3px 4px" : "2px 0",
      marginBottom: 3,
      background: highlight ? "#d4edda" : "transparent",
      border: highlight ? "1px solid #28a745" : "none",
      borderRadius: highlight ? 3 : 0
    }}>
      <span style={{ fontWeight: "bold", fontSize: highlight ? 12 : 11 }}>{label}</span>
      <span style={{ fontWeight: "bold", fontSize: highlight ? 13 : 11, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SigLine({ label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ borderTop: "1px solid #555", marginTop: 24, paddingTop: 3, fontSize: 10 }}>{label}</div>
    </div>
  );
}

export default function WeighingTicket({ weighing, company, onClose }) {
  if (!weighing) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden !important; }
          #weighing-ticket-print, #weighing-ticket-print * { visibility: visible !important; }
          #weighing-ticket-print {
            position: fixed; left: 0; top: 0;
            width: 100%; height: 100%;
            display: flex; gap: 2%;
            align-items: flex-start;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex justify-end mb-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Ticket (A4 Paisagem)
        </Button>
      </div>

      {/* Preview on screen */}
      <div id="weighing-ticket-print" style={{ display: "flex", gap: "2%", alignItems: "flex-start" }}>
        <TicketVia weighing={weighing} company={company} label="1ª VIA — EMPRESA" />
        <TicketVia weighing={weighing} company={company} label="2ª VIA — MOTORISTA" />
      </div>
    </div>
  );
}