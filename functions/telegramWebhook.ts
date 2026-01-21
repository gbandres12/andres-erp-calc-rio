import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) return Response.json({ error: "No Token" }, { status: 500 });

    // Helper to send message
    const sendTelegram = async (chatId, text) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_Token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
        } catch (e) { console.error("Send Error:", e); }
    };

    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (!body.message || !body.message.text) return Response.json({ status: "ignored" });

            const chatId = String(body.message.chat.id);
            const userText = body.message.text;
            const username = body.message.from.first_name || "User";

            console.log(`Msg: ${userText}`);

            // 1. Context Loading
            const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
            const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });
            
            // 2. Construct Prompt
            let prompt = `Você é um assistente financeiro. 
            Diretrizes:
            - Sistema multi-filial. Identifique a filial (Company) para transações.
            - Se não souber a filial, PERGUNTE.
            - Responda em JSON estrito.
            
            Dados Disponíveis:
            Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
            Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id, balance: a.current_balance})))}

            User Input: "${userText}"

            Output Format (JSON only):
            {
                "action": "reply" | "create_transaction" | "read_transactions",
                "reply_text": "text to user (required if action is reply)",
                "transaction_data": { ...fields for Transaction entity... } (if create),
                "filter_data": { ...fields... } (if read)
            }
            Para criar transação, campos: description, amount, type (receita/despesa), category, company_id (OBRIGATÓRIO), account_id (opcional), status (pendente/pago), due_date.
            `;

            // 3. Call LLM
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        action: { type: "string", enum: ["reply", "create_transaction", "read_transactions"] },
                        reply_text: { type: "string" },
                        transaction_data: { type: "object", additionalProperties: true },
                        filter_data: { type: "object", additionalProperties: true }
                    },
                    required: ["action"]
                }
            });

            console.log("LLM Decision:", response);

            // 4. Execute Action
            if (response.action === "reply") {
                await sendTelegram(chatId, response.reply_text || "Entendido.");
            } 
            else if (response.action === "create_transaction") {
                const data = response.transaction_data;
                if (!data.company_id) {
                     await sendTelegram(chatId, "Preciso saber para qual filial lançar essa transação. " + companies.map(c => c.name).join(", "));
                } else {
                    // Create
                    const tx = await base44.asServiceRole.entities.Transaction.create({
                        ...data,
                        status: data.status || 'pendente',
                        due_date: data.due_date || new Date().toISOString().split('T')[0]
                    });
                    
                    // Recalculate balance if needed
                    base44.functions.invoke('recalculateBalance', { company_id: data.company_id });
                    
                    await sendTelegram(chatId, `✅ Transação criada!\n${tx.description} - R$ ${tx.amount}\nFilial: ${companies.find(c=>c.id===tx.company_id)?.name}`);
                }
            }
            else if (response.action === "read_transactions") {
                // Simple list
                const filters = response.filter_data || {};
                const list = await base44.asServiceRole.entities.Transaction.filter(filters, '-created_date', 5);
                
                if (list.length === 0) {
                    await sendTelegram(chatId, "Nenhuma transação encontrada recentemente.");
                } else {
                    const msg = list.map(t => `${t.description}: R$ ${t.amount} (${t.type})`).join("\n");
                    await sendTelegram(chatId, "Últimas transações:\n" + msg);
                }
            }

            return Response.json({ status: "processed" });

        } catch (error) {
            console.error("Error:", error);
            await sendTelegram(String(req.body?.message?.chat?.id), "Ocorreu um erro interno.");
            return Response.json({ error: error.message }, { status: 500 });
        }
    }
    return new Response("OK");
}

Deno.serve(telegramWebhook);