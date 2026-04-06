import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CategorySuggestion({ description, type, transactions = [], onSuggest }) {
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const lastDescRef = useRef('');

  // Auto-suggest after 1.5s of inactivity when description changes
  useEffect(() => {
    if (!description || description.length < 5 || description === lastDescRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autoSuggest();
    }, 1500);
    return () => clearTimeout(debounceRef.current);
  }, [description]);

  const autoSuggest = async () => {
    if (!description || description.length < 5) return;
    lastDescRef.current = description;
    setLoading(true);
    try {
      const history = transactions
        .filter(t => t.type === type && t.category && t.description)
        .slice(0, 30)
        .map(t => `"${t.description}" → ${t.category}`)
        .join('\n');

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente de categorização financeira para uma empresa de mineração/calcário.
Com base no histórico de lançamentos e na descrição fornecida, sugira a categoria mais adequada.

TIPO: ${type === 'despesa' ? 'Despesa' : 'Receita'}
DESCRIÇÃO ATUAL: "${description}"

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
        onSuggest(result.category);
      }
    } catch {
      // Silent fail for auto-suggest
    } finally {
      setLoading(false);
    }
  };

  if (!description || description.length < 5) return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      {loading ? (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Sugerindo categoria...
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-0"
          onClick={autoSuggest}
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Sugerir categoria com IA
        </Button>
      )}
    </div>
  );
}