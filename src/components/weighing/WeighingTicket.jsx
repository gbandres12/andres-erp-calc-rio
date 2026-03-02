import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function WeighingTicket({ weighing, company, onClose }) {
  if (!weighing) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatDateTime = (dt) => {
    if (!dt) return "___/___/___ - __:__";
    const d = new Date(dt);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} - ${hour}:${min}`;
  };

  const formatWeight = (kg) => {
    if (!kg && kg !== 0) return "-";
    return kg.toLocaleString("pt-BR");
  };

  return (
    <div>
      {/* Print button - hidden during print */}
      <div className="no-print flex justify-end mb-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Ticket
        </Button>
      </div>

      {/* Ticket Content */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #weighing-ticket, #weighing-ticket * { visibility: visible !important; }
          #weighing-ticket { position: fixed; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="weighing-ticket" className="bg-white border border-slate-300 font-sans text-sm" style={{ maxWidth: 750, margin: "0 auto" }}>
        {/* Header */}
        <div className="grid grid-cols-2 border-b border-slate-300">
          {/* Left - Company info */}
          <div className="p-4 border-r border-slate-300">
            <h2 className="text-center font-bold text-base mb-2">
              BALANÇA - {company?.name?.toUpperCase() || "CALCÁRIO AMAZÔNIA"}
            </h2>
            {company?.address && (
              <p className="text-xs text-center">{company.address}</p>
            )}
            {company?.city && (
              <p className="text-xs text-center">{company.city} - {company.state}</p>
            )}
            {company?.phone && (
              <p className="text-xs text-center mt-1">Fone: {company.phone}</p>
            )}
          </div>

          {/* Right - Client/Transporter info */}
          <div className="p-4 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold w-24">Cliente</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 font-bold text-sm min-h-[24px]">
                {weighing.client_name || ""}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold w-24">Transportador</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm min-h-[24px]">
                {weighing.transporter || weighing.driver_name || ""}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold w-24">Placa Cavalinho</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm min-h-[24px]">
                {weighing.vehicle_plate || ""}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold w-24">Placa 1º Reboque</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm min-h-[24px]">
                {weighing.vehicle_plate2 || ""}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold w-24">Placa 2º Reboque</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm min-h-[24px]">
                {weighing.vehicle_plate3 || ""}
              </span>
            </div>
          </div>
        </div>

        {/* Middle - Ticket info + Weights */}
        <div className="grid grid-cols-2 border-b border-slate-300">
          {/* Left - Ticket details */}
          <div className="p-4 border-r border-slate-300 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-16">Ticket</span>
              <span className="text-xs">:</span>
              <span className="border border-slate-400 px-2 py-1 font-bold text-sm w-20 text-center">
                {weighing.ticket_number || weighing.reference}
              </span>
              <span className="text-xs ml-4">{formatDateTime(weighing.tare_datetime || weighing.entry_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-16">Pesagem</span>
              <span className="text-xs">:</span>
              <span className="border border-slate-400 px-2 py-1 text-sm w-20 text-center">Autorizada</span>
              <span className="text-xs ml-4">{formatDateTime(weighing.gross_datetime || weighing.exit_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-16">Produto</span>
              <span className="text-xs">:</span>
              <span className="border border-slate-400 px-2 py-1 font-bold text-sm flex-1 text-center uppercase">
                {weighing.product || ""}
              </span>
            </div>
          </div>

          {/* Right - Weights */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-24">Peso Tara</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm text-right min-h-[24px]">
                {formatWeight(weighing.tare)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-24">Peso Bruto</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border border-slate-400 px-2 py-1 text-sm text-right min-h-[24px]">
                {formatWeight(weighing.gross)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-24">Peso Líquido</span>
              <span className="text-xs">:</span>
              <span className="flex-1 border-2 border-slate-500 bg-green-50 px-2 py-1 text-base font-bold text-right min-h-[24px]">
                {formatWeight(weighing.net)}
              </span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="p-4 grid grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold mb-4">Emitente: ___________________________________</p>
            </div>
            <div>
              <p className="text-xs font-semibold">Fiscal de Operação: ___________________________</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold mb-4">Motorista: ___________________________________</p>
            {weighing.operator && (
              <p className="text-xs text-slate-500 mt-6">Operador: {weighing.operator}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}