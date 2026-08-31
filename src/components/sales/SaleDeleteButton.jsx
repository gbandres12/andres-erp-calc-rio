import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import DeleteAuthDialog from "@/components/sales/DeleteAuthDialog";
import { deleteProtectedRecord } from "@/utils/protectedDelete";

export default function SaleDeleteButton({ sale, selectedCompanyId, onDeleted }) {
  const [open, setOpen] = useState(false);
  if (!sale) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-red-600 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Excluir
      </Button>
      <DeleteAuthDialog
        open={open}
        onClose={() => setOpen(false)}
        itemType="venda"
        onSuccess={async (password) => {
          try {
            await deleteProtectedRecord({
              kind: "sale",
              id: sale.id,
              password,
              company_id: sale.company_id || selectedCompanyId,
            });
            toast.success("Venda excluída e caixa estornado.");
            onDeleted?.();
          } catch (err) {
            toast.error("Erro ao excluir venda: " + (err.message || err));
          } finally {
            setOpen(false);
          }
        }}
      />
    </>
  );
}
