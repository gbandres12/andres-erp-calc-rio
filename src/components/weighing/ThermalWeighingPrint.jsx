import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const WIDTH = 46;

const center = (text, width = WIDTH) => {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
};

const solidLine = () => '='.repeat(WIDTH);
const dottedLine = () => '-'.repeat(WIDTH);

const wrapText = (text, maxWidth = WIDTH - 2) => {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let currentLine = '';
  words.forEach(word => {
    if ((currentLine + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
};

const formatDateTime = (dt) => {
  if (!dt) return "__/__/____ __:__";
  const d = new Date(dt);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

const formatKg = (kg) => {
  if (kg === null || kg === undefined || isNaN(kg)) return "-";
  return Number(kg).toLocaleString("pt-BR") + " Kg";
};

const row = (label, value) => {
  if (!value) return '';
  return `${label}: ${value}`;
};

function buildThermalVia(w, company, label) {
  const lines = [];
  lines.push(center((company?.name?.toUpperCase() || "EMPRESA").slice(0, WIDTH)));
  lines.push('');
  lines.push(center('*** TICKET DE PESAGEM ***'));
  lines.push(center(label));
  lines.push(solidLine());
  lines.push(`Ticket: ${w.ticket_number || w.reference}`);
  lines.push(`Ref: ${w.reference}`);
  lines.push(`Data: ${formatDateTime(w.tare_datetime || w.entry_time || w.created_date)}`);
  lines.push(dottedLine());

  if (w.client_name) wrapText(`Cliente: ${w.client_name}`).forEach(l => lines.push(l));
  if (w.transporter || w.driver_name) wrapText(`Transportador: ${w.transporter || w.driver_name}`).forEach(l => lines.push(l));
  if (w.driver_name) wrapText(`Motorista: ${w.driver_name}`).forEach(l => lines.push(l));
  if (w.product) wrapText(`Produto: ${w.product}`).forEach(l => lines.push(l));
  if (w.origin) wrapText(`Origem: ${w.origin}`).forEach(l => lines.push(l));
  if (w.destination) wrapText(`Destino: ${w.destination}`).forEach(l => lines.push(l));
  lines.push(dottedLine());

  const right = (l, v) => {
    const spaces = WIDTH - l.length - v.length;
    return l + ' '.repeat(Math.max(1, spaces)) + v;
  };
  lines.push(right('Tara:', formatKg(w.tare)));
  lines.push(right('Bruto:', formatKg(w.gross)));
  lines.push(solidLine());
  lines.push(right('LIQUIDO (KG):', formatKg(w.net)));
  lines.push(right('LIQUIDO (TON):', Number(w.net_tons ?? (w.net || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " t"));
  lines.push(solidLine());

  lines.push('');
  lines.push(center('______________    ______________'));
  lines.push(center('Emitente          Motorista'));
  lines.push('');
  if (w.operator) lines.push(center(`Operador: ${w.operator}`));
  return lines.join('\n');
}

export function printThermalWeighing(weighing, company) {
  const via1 = buildThermalVia(weighing, company, '1a VIA - EMPRESA');
  const via2 = buildThermalVia(weighing, company, '2a VIA - MOTORISTA');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Ticket ${weighing.ticket_number || weighing.reference}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 80mm;
      background: #fff;
    }
    pre {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.4;
      color: #000;
      margin: 0;
      padding: 2mm;
      white-space: pre;
    }
    .vias { display: block; }
  </style>
</head>
<body>
  <div class="vias">
    <pre>${via1}</pre>
    <pre>${via2}</pre>
  </div>
</body>
</html>`;

  // imprime por iframe oculto — sem pop-up (não é bloqueado) e com página 80mm real
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 60000);
    }
  };
  iframe.srcdoc = html;
}

export default function ThermalWeighingButton({ weighing, company }) {
  return (
    <Button
      onClick={() => printThermalWeighing(weighing, company)}
      variant="outline"
      className="gap-2"
    >
      <Printer className="w-4 h-4" />
      Imprimir Térmica (80mm)
    </Button>
  );
}