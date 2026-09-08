import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Busca automática de endereço via ViaCEP ao digitar o CEP.
 * Retorna { cepLoading, handleCepChange }.
 * handleCepChange(rawCep) aplica máscara 00000-000, dispara a busca
 * quando chega a 8 dígitos e repassa o resultado ao onResult.
 */
export default function useCepLookup(onResult) {
  const [cepLoading, setCepLoading] = useState(false);

  const handleCepChange = useCallback((rawCep) => {
    const digits = rawCep.replace(/\D/g, "");
    const value = digits.length > 5
      ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}`
      : digits;

    if (digits.length === 8) {
      setCepLoading(true);
      fetch(`https://viacep.com.br/ws/${digits}/json/`)
        .then(res => res.json())
        .then(data => {
          if (!data.erro) onResult(data);
          else toast.error("CEP não encontrado.");
        })
        .catch(err => console.error("Erro ao buscar CEP:", err))
        .finally(() => setCepLoading(false));
    }
    return value;
  }, [onResult]);

  return { cepLoading, handleCepChange };
}