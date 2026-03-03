import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const formatDateTime = (dt) => {
  if (!dt) return "__/__/____ __:__";
  const d = new Date(dt);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

const formatTon = (kg) => {
  if (kg === null || kg === undefined || isNaN(kg)) return "-";
  return (kg / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " t";
};

export default function WeighingTicket({ weighing, company, onClose }) {
  if (!weighing) return null;

  const handlePrint = () => {
    const via1 = buildViaHTML(weighing, company, "1ª VIA — EMPRESA");
    const via2 = buildViaHTML(weighing, company, "2ª VIA — MOTORISTA");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Ticket ${weighing.ticket_number || weighing.reference}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; background: white; }
    .page { display: flex; gap: 10mm; width: 100%; height: 100%; }
    .via { flex: 1; border: 1.5px solid #444; }
    .header { background: #f0f0f0; border-bottom: 1px solid #555; padding: 6px 10px; text-align: center; }
    .header-title { font-weight: bold; font-size: 13px; }
    .header-sub { font-size: 10px; margin-top: 2px; }
    .via-label { font-size: 10px; font-weight: bold; color: #555; margin-top: 4px; }
    .ticket-bar { display: flex; gap: 16px; padding: 4px 10px; border-bottom: 1px solid #ccc; font-size: 11px; }
    .ticket-bar b { margin-right: 2px; }
    .body-grid { display: grid; grid-template-columns: 1fr 1fr; }
    .col { padding: 6px 10px; }
    .col-left { border-right: 1px solid #ccc; }
    .row { display: flex; align-items: baseline; margin-bottom: 5px; gap: 4px; }
    .row-label { min-width: 95px; font-weight: bold; font-size: 10px; flex-shrink: 0; }
    .row-val { flex: 1; border-bottom: 1px solid #aaa; min-height: 14px; padding-bottom: 1px; }
    .weights { margin-top: 8px; border-top: 1px solid #ccc; padding-top: 8px; }
    .w-row { display: flex; justify-content: space-between; padding: 2px 0; margin-bottom: 2px; }
    .w-highlight { background: #d4edda; border: 1px solid #28a745; border-radius: 3px; padding: 3px 6px; font-size: 13px; font-weight: bold; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 10px 10px 8px; gap: 10px; border-top: 1px solid #ccc; margin-top: 8px; }
    .sig { text-align: center; }
    .sig-line { border-top: 1px solid #555; margin-top: 28px; padding-top: 3px; font-size: 10px; }
    .operator-info { font-size: 9px; color: #666; padding: 0 10px 6px; }
  </style>
</head>
<body>
  <div class="page">
    ${via1}
    ${via2}
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1100,height=700");
    win.document.write(html);
    win.document.close();
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Ticket (A4 Paisagem)
        </Button>
      </div>

      {/* Preview on screen */}
      <div style={{ display: "flex", gap: 16, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
        <TicketVia weighing={weighing} company={company} label="1ª VIA — EMPRESA" />
        <TicketVia weighing={weighing} company={company} label="2ª VIA — MOTORISTA" />
      </div>
    </div>
  );
}

function buildViaHTML(w, company, label) {
  const row = (lbl, val) => `
    <div class="row">
      <span class="row-label">${lbl}:</span>
      <span class="row-val">${val || ""}</span>
    </div>`;

  const wRow = (lbl, val, highlight) => highlight
    ? `<div class="w-row w-highlight"><span>${lbl}</span><span>${val}</span></div>`
    : `<div class="w-row"><span style="font-weight:bold">${lbl}</span><span style="font-weight:bold">${val}</span></div>`;

  return `
  <div class="via">
    <div class="header">
      <div class="header-title">${company?.name?.toUpperCase() || "EMPRESA"} — TICKET DE PESAGEM</div>
      ${company?.address ? `<div class="header-sub">${company.address}${company.city ? `, ${company.city}/${company.state}` : ""}</div>` : ""}
      ${company?.phone ? `<div class="header-sub">Fone: ${company.phone}</div>` : ""}
      <div class="via-label">${label}</div>
    </div>
    <div class="ticket-bar">
      <span><b>Ticket:</b> ${w.ticket_number || w.reference}</span>
      <span><b>Ref:</b> ${w.reference}</span>
      <span><b>Data:</b> ${formatDateTime(w.tare_datetime || w.entry_time || w.created_date)}</span>
    </div>
    <div class="body-grid">
      <div class="col col-left">
        ${row("Cliente", w.client_name)}
        ${row("Transportador", w.transporter || w.driver_name)}
        ${row("Motorista", w.driver_name)}
        ${row("Produto", `<b>${w.product || ""}</b>`)}
        ${row("Origem", w.origin)}
        ${row("Destino", w.destination)}
      </div>
      <div class="col">
        ${row("Placa Cavalinho", w.vehicle_plate)}
        ${row("Placa 1º Reboque", w.vehicle_plate2)}
        ${row("Placa 2º Reboque", w.vehicle_plate3)}
        <div class="weights">
          ${wRow("Tara", formatTon(w.tare), false)}
          ${wRow("Bruto", formatTon(w.gross), false)}
          ${wRow("Líquido", formatTon(w.net), true)}
        </div>
        ${w.operator ? `<div style="font-size:9px;color:#666;margin-top:6px">Operador: ${w.operator}</div>` : ""}
      </div>
    </div>
    <div class="signatures">
      <div class="sig"><div class="sig-line">Emitente</div></div>
      <div class="sig"><div class="sig-line">Motorista</div></div>
      <div class="sig"><div class="sig-line">Fiscal de Operação</div></div>
    </div>
  </div>`;
}

// Screen preview component
function TicketVia({ weighing: w, company, label }) {
  const row = (lbl, val, bold) => (
    <div style={{ display:"flex", alignItems:"baseline", marginBottom:5, gap:4 }}>
      <span style={{ minWidth:95, fontWeight:"bold", fontSize:10, flexShrink:0 }}>{lbl}:</span>
      <span style={{ flex:1, borderBottom:"1px solid #aaa", minHeight:14, fontWeight: bold?"bold":"normal" }}>{val||""}</span>
    </div>
  );

  return (
    <div style={{ flex:1, border:"1.5px solid #444", fontFamily:"Arial, sans-serif", fontSize:11 }}>
      <div style={{ background:"#f0f0f0", borderBottom:"1px solid #555", padding:"6px 10px", textAlign:"center" }}>
        <div style={{ fontWeight:"bold", fontSize:13 }}>{company?.name?.toUpperCase() || "EMPRESA"} — TICKET DE PESAGEM</div>
        {company?.address && <div style={{ fontSize:10 }}>{company.address}{company.city ? `, ${company.city}/${company.state}` : ""}</div>}
        {company?.phone && <div style={{ fontSize:10 }}>Fone: {company.phone}</div>}
        <div style={{ fontSize:10, fontWeight:"bold", color:"#555", marginTop:4 }}>{label}</div>
      </div>
      <div style={{ display:"flex", gap:16, padding:"4px 10px", borderBottom:"1px solid #ccc" }}>
        <span><b>Ticket:</b> {w.ticket_number || w.reference}</span>
        <span><b>Ref:</b> {w.reference}</span>
        <span><b>Data:</b> {formatDateTime(w.tare_datetime || w.entry_time || w.created_date)}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
        <div style={{ padding:"6px 10px", borderRight:"1px solid #ccc" }}>
          {row("Cliente", w.client_name)}
          {row("Transportador", w.transporter || w.driver_name)}
          {row("Motorista", w.driver_name)}
          {row("Produto", w.product, true)}
          {row("Origem", w.origin)}
          {row("Destino", w.destination)}
        </div>
        <div style={{ padding:"6px 10px" }}>
          {row("Placa Cavalinho", w.vehicle_plate)}
          {row("Placa 1º Reboque", w.vehicle_plate2)}
          {row("Placa 2º Reboque", w.vehicle_plate3)}
          <div style={{ marginTop:8, borderTop:"1px solid #ccc", paddingTop:8 }}>
            {[["Tara", w.tare, false],["Bruto", w.gross, false],["Líquido", w.net, true]].map(([lbl, kg, hl]) => (
              <div key={lbl} style={{
                display:"flex", justifyContent:"space-between", padding: hl?"3px 6px":"2px 0",
                marginBottom:3, background: hl?"#d4edda":"transparent",
                border: hl?"1px solid #28a745":"none", borderRadius: hl?3:0,
                fontWeight:"bold", fontSize: hl?12:11
              }}>
                <span>{lbl}</span><span>{formatTon(kg)}</span>
              </div>
            ))}
          </div>
          {w.operator && <div style={{ fontSize:9, color:"#666", marginTop:6 }}>Operador: {w.operator}</div>}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"10px 10px 8px", gap:10, borderTop:"1px solid #ccc" }}>
        {["Emitente","Motorista","Fiscal de Operação"].map(s => (
          <div key={s} style={{ textAlign:"center" }}>
            <div style={{ borderTop:"1px solid #555", marginTop:28, paddingTop:3, fontSize:10 }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}