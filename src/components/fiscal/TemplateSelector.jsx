import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileText, Settings2 } from "lucide-react";
import FiscalTemplateDialog from "@/components/fiscal/FiscalTemplateDialog";

export default function TemplateSelector({ companyId, onApply }) {
  const { data: templates = [] } = useQuery({
    queryKey: ["fiscal_templates", companyId],
    queryFn: () => base44.entities.FiscalTemplate.filter({ company_id: companyId }),
    enabled: !!companyId
  });
  const [showManage, setShowManage] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <FileText className="w-4 h-4 text-violet-600" /> Modelos:
      </span>
      {templates.length === 0 && (
        <span className="text-sm text-slate-400">Nenhum modelo criado ainda</span>
      )}
      {templates.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onApply(t)}
          title={`Aplicar modelo "${t.name}"`}
          className="px-3 py-1.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-colors"
        >
          {t.name}
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setShowManage(true)} className="text-slate-500">
        <Settings2 className="w-4 h-4 mr-1" /> Gerenciar
      </Button>
      <FiscalTemplateDialog open={showManage} onOpenChange={setShowManage} companyId={companyId} />
    </div>
  );
}