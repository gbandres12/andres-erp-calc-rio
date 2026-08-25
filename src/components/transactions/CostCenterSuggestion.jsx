import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, Check } from "lucide-react";

// Normaliza string (sem acento, minúscula) para comparação tolerante
const normalize = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Casa a resposta livre da IA com um centro de custo histórico (exata ou por similaridade)
function matchCostCenter(raw, known) {
  if (!raw) return null;
  const norm = normalize(raw);
  const exact = known.find((c) => normalize(c) === norm);
  if (exact) return exact;
  const sub = known.find((c) => normalize(c).includes(norm) || norm.includes(normalize(c)));
  return sub || null;
}

export default function CostCenterSuggestion({ description, category, notes, transactions = [], onSuggest, currentCostCenter }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const debounceRef = useRef(null);
  const lastKeyRef = useRef('');

  // Lista de centros de custo já usados (mesma empresa — transactions vem filtrado)
  const knownCostCenters = React.useMemo(() => {
    const set = new Set();
    transactions.forEach((t) => { if (t.cost_center && t.cost_center.trim()) set.add(t.cost_center.trim()); });
    return Array.from(set).sort();
  }, [transactions]);

  // Auto-suggest after 1.5s of inactivity when description changes
  useEffect(() => {
    if (!description || description.length < 5) {
      setSuggestion(null);
      return;
    }
    const key = `${description}||${category || ''}||${notes || ''}`;
    if (key === lastKeyRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { autoSuggest(); }, 1500);
    return () => clearTimeout(debounceRef.current);
  }, [description, category, notes]);

  const autoSuggest = async () => {
    if (!description || description.length < 5) return;
    lastKeyRef.current = `${description}||${category || ''}||${notes || ''}`;
    setLoading(true);
    setSuggestion(null);
    try {
      const history = transactions
        .filter((t) => t.cost_center && t.description)
        .slice(0, 40)
        .map((t) => `"${t.description}"${t.category ? ` (${t.category})` : ''} → ${t.cost_center}`)
        .join('\n');

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente contábil para uma empresa de mineração/calcário.
Sua tarefa é classificar o CENTRO DE CUSTO mais adequado para o lançamento financeiro.

DESCRIÇÃO: "${description}"
CATEGORIA: "${category || 'Não informada'}"
OBSERVAÇÕES: "${notes || 'Nenhuma'}"

CENTROS DE CUSTO JÁ USADOS (prefira reusar um existente quando fizer sentido):
${knownCostCenters.length ? knownCostCenters.join(', ') : 'Nenhum cadastrado ainda.'}

EXEMPLOS DE CLASSIFICAÇÕES ANTERIORES (descrição → centro de custo):
${history || 'Sem histórico disponível.'}

Responda APENAS com o nome de um centro de custo curto (máx 3 palavras). Pode ser um já usado ou um novo se nenhum se encaixar. Sem explicações.`,
        response_json_schema: {
          type: "object",
          properties: { cost_center: { type: "string" } },
          required: ["cost_center"]
        }
      });

      if (result?.cost_center) {
        const raw = String(result.cost_center).trim();
        const matched = matchCostCenter(raw, knownCostCenters);
        setSuggestion(matched || raw);
      }
    } catch {
      // Silent fail for auto-suggest
    } finally {
      setLoading(false);
    }
  };

  if (!description || description.length < 5) return null;

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {loading ? (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          IA classificando centro de custo...
        </span>
      ) : suggestion ? (
        suggestion === currentCostCenter ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check className="w-3 h-3" /> Centro de custo sugerido pela IA aplicado
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { onSuggest(suggestion); setSuggestion(null); }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium border border-amber-200"
          >
            <Sparkles className="w-3 h-3" />
            Sugerido: <strong>{suggestion}</strong>
            <span className="text-amber-400">· clique para aplicar</span>
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={autoSuggest}
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-0.5 rounded transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Sugerir centro de custo com IA
        </button>
      )}
    </div>
  );
}