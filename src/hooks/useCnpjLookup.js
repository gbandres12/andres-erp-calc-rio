import { useCallback, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Consulta automática de dados de CNPJ via função backend lookupCnpj
 * (base pública OpenCNPJ). Retorna { cnpjLoading, lookupCnpj }.
 * lookupCnpj(rawDoc) dispara a consulta quando o documento tem 14 dígitos
 * e repassa o resultado ao onResult (campos preenchidos ficam a cargo do chamador).
 */
export default function useCnpjLookup(onResult) {
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const lastLookup = useRef(null);

  const lookupCnpj = useCallback(async (rawDoc) => {
    const digits = (rawDoc || "").replace(/\D/g, "");
    if (digits.length !== 14 || lastLookup.current === digits) return;
    lastLookup.current = digits;
    setCnpjLoading(true);
    try {
      const res = await base44.functions.invoke("lookupCnpj", { cnpj: digits });
      const data = res?.data ?? res;
      if (data?.found) {
        onResult(data);
      } else {
        toast.error(data?.error || "CNPJ não encontrado na base pública.");
      }
    } catch (e) {
      lastLookup.current = null;
      toast.error("Não foi possível consultar o CNPJ agora.");
    } finally {
      setCnpjLoading(false);
    }
  }, [onResult]);

  return { cnpjLoading, lookupCnpj };
}