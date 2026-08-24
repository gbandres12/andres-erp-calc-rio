import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, Check } from "lucide-react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/components/utils/categories";

// Normaliza string (sem acento, minúscula) para comparação tolerante
const normalize = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Casa a resposta livre da IA com uma categoria oficial (exata ou por similaridade)
function matchCategory(raw, allowed) {
  if (!raw) return null;
  const norm = normalize(raw);
  const exact = allowed.find((c) => normalize(c) === norm);
  if (exact) return exact;
  const sub = allowed.find((c) => normalize(c).includes(norm) || norm.includes(normalize(c)));
  return sub || null;
}

export default function CategorySuggestion({ description, notes, type, transactions = [], onSuggest, currentCategory }) {
  const allowedCategories = type === "despesa" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const debounceRef = useRef(null);
  const lastKeyRef = useRef('');

  // Auto-suggest after 1.5s of inactivity when description changes
  useEffect(() => {
    if (!description || description.length < 5) {
      setSuggestion(null);
      return;
    }
    const key = `${description}||${notes || ''}`;
    if (key === lastKeyRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autoSuggest();
    }, 1500);
    return () => clearTimeout(debounceRef.current);
  }, [description, notes]);

  const autoSuggest = async () => {
    if (!description || description.length < 5) return;
    lastKeyRef.current = `${description}||${notes || ''}`;
    setLoading(true);
    setSuggestion(null);
    try {
      const history = transactions
        .filter(t => t.type === type && t.category && allowedCategories.includes(t.category) && t.description)
        .slice(0, 30)
        .map(t => `"${t.description}" → ${t.category}`)
        .join('\n');

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente de categorização financeira para uma empresa de mineração/calcário.
Escolha a categoria mais adequada para o lançamento, usando OBRIGATORIAMENTE uma das categorias oficiais abaixo.

TIPO: ${type === 'despesa' ? 'Saída (Despesa)' : 'Entrada (Receita)'}
DESCRIÇÃO: "${description}"
OBSERVAÇÕES: "${notes || 'Nenhuma'}"

CATEGORIAS OFICIAIS (responda com o nome EXATO de uma delas):
${allowedCategories.join(', ')}

HISTÓRICO DE CATEGORIZAÇÕES (descrição → categoria):
${history || 'Sem histórico disponível.'}

Responda APENAS com o nome exato de uma das categorias oficiais, sem explicações adicionais.`,
        response_json_schema: {
          type: "object",
          properties: { category: { type: "string" } },
          required: ["category"]
        }
      });

      if (result?.category) {
        const matched = matchCategory(result.category, allowedCategories);
        if (matched) setSuggestion(matched);
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
          IA está analisando descrição e observações...
        </span>
      ) : suggestion ? (
        suggestion === currentCategory ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check className="w-3 h-3" /> Categoria sugerida pela IA aplicada
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { onSuggest(suggestion); setSuggestion(null); }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-medium border border-purple-200"
          >
            <Sparkles className="w-3 h-3" />
            Sugerido: <strong>{suggestion}</strong>
            <span className="text-purple-400">· clique para aplicar</span>
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={autoSuggest}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-0.5 rounded transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Sugerir categoria com IA
        </button>
      )}
    </div>
  );
}