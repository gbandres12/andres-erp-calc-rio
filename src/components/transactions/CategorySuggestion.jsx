import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, Check } from "lucide-react";

export default function CategorySuggestion({ description, notes, type, transactions = [], onSuggest, currentCategory }) {
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
        .filter(t => t.type === type && t.category && t.description)
        .slice(0, 30)
        .map(t => `"${t.description}" → ${t.category}`)
        .join('\n');

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente de categorização financeira para uma empresa de mineração/calcário.
Com base no histórico de lançamentos, na descrição e observações fornecidas, sugira a categoria mais adequada.

TIPO: ${type === 'despesa' ? 'Saída (Despesa)' : 'Entrada (Receita)'}
DESCRIÇÃO: "${description}"
OBSERVAÇÕES: "${notes || 'Nenhuma'}"

HISTÓRICO DE CATEGORIZAÇÕES (descrição → categoria):
${history || 'Sem histórico disponível.'}

Responda APENAS com o nome da categoria em português, sem explicações adicionais.
Exemplos válidos: Combustível, Folha de Pagamento, Venda de Calcário, Manutenção, Impostos, etc.`,
        response_json_schema: {
          type: "object",
          properties: { category: { type: "string" } },
          required: ["category"]
        }
      });

      if (result?.category) {
        setSuggestion(result.category);
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