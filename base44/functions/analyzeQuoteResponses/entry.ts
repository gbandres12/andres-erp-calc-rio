import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function analyzeQuoteResponses(req) {
    const base44 = createClientFromRequest(req);
    
    try {
        const { quote_request_id } = await req.json();
        
        if (!quote_request_id) {
            return Response.json({ error: "Missing quote_request_id" }, { status: 400 });
        }

        // 1. Buscar dados
        const request = await base44.asServiceRole.entities.SupplierQuoteRequest.get(quote_request_id);
        const responses = await base44.asServiceRole.entities.SupplierQuoteResponse.filter({
            quote_request_id: quote_request_id
        });

        if (responses.length === 0) {
            return Response.json({ message: "Nenhuma resposta para analisar." });
        }

        // 2. Preparar Prompt para IA
        const prompt = `
        Você é um analista de compras experiente e objetivo.
        Analise as seguintes propostas para a solicitação de compra abaixo e determine a melhor opção.

        SOLICITAÇÃO:
        Produto: ${request.product_name}
        Quantidade: ${request.quantity}
        Urgência: ${request.urgency}
        Obs: ${request.notes}

        PROPOSTAS RECEBIDAS:
        ${JSON.stringify(responses.map(r => ({
            id: r.id,
            fornecedor: r.supplier_name,
            preco: r.price,
            prazo: r.delivery_date,
            condicoes: r.conditions
        })))}

        CRITÉRIOS:
        - Menor preço é importante, mas se a urgência for ALTA, o prazo de entrega tem peso maior.
        - Condições de pagamento favoráveis também contam.
        
        RETORNO (JSON estrito):
        {
            "best_option_id": "ID da proposta vencedora",
            "analysis_text": "Texto curto justificando a escolha (max 2 frases).",
            "ranking": ["ID 1", "ID 2", ...] (ordem do melhor para o pior)
        }
        `;

        // 3. Chamar LLM
        const analysis = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    best_option_id: { type: "string" },
                    analysis_text: { type: "string" },
                    ranking: { type: "array", items: { type: "string" } }
                },
                required: ["best_option_id", "analysis_text"]
            }
        });

        // 4. Atualizar Entidades
        // Resetar vencedores anteriores
        for (const resp of responses) {
            await base44.asServiceRole.entities.SupplierQuoteResponse.update(resp.id, {
                is_winner: false,
                ai_analysis: null
            });
        }

        // Marcar novo vencedor
        if (analysis.best_option_id) {
            await base44.asServiceRole.entities.SupplierQuoteResponse.update(analysis.best_option_id, {
                is_winner: true,
                ai_analysis: analysis.analysis_text
            });
        }

        // Atualizar status da solicitação
        await base44.asServiceRole.entities.SupplierQuoteRequest.update(quote_request_id, {
            status: 'concluido' // Ou 'analisado'
        });

        return Response.json({ 
            success: true, 
            analysis: analysis 
        });

    } catch (error) {
        console.error("Error analyzing quotes:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

Deno.serve(analyzeQuoteResponses);