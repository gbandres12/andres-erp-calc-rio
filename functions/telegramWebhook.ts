import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) return Response.json({ error: "No Token" }, { status: 500 });

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

            console.log(`Msg from ${username}: ${userText}`);

            // 1. Session & History
            let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chatId }))[0];
            
            if (!session) {
                session = await base44.asServiceRole.entities.TelegramChatSession.create({
                    chat_id: chatId,
                    history: []
                });
            }

            // Prepare History
            let history = session.history || [];
            // Keep last 10 messages to avoid token limits
            if (history.length > 10) history = history.slice(-10);
            
            // 2. Load Context Data
            const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
            const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });
            
            // 3. Construct Prompt with History
            const historyText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
            
            let prompt = `Você é um assistente financeiro inteligente.
            
            CONTEXTO DO CHAT:
            ${historyText}
            User: "${userText}"

            DIRETRIZES:
            - Identifique a filial (Company) e Conta (FinancialAccount).
            - Se o usuário não disser a filial, PERGUNTE. (Ex: "Para qual filial?")
            - Responda em JSON estrito.
            
            DADOS DISPONÍVEIS:
            Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
            Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id, balance: a.current_balance})))}

            AÇÕES POSSÍVEIS:
            1. "reply": Apenas responder (dúvidas, cumprimentos, pedir mais dados).
            2. "create_transaction": Criar lançamento (apenas se tiver todos os dados: valor, tipo, filial).
            3. "read_transactions": Listar últimos lançamentos.

            FORMATO DE RESPOSTA (JSON):
            {
                "action": "reply" | "create_transaction" | "read_transactions",
                "reply_text": "Texto da resposta para o usuário",
                "transaction_data": { ... } (apenas se create),
                "filter_data": { ... } (apenas se read)
            }
            `;

            // 4. Invoke AI
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
                    required: ["action", "reply_text"]
                }
            });

            console.log("AI Decision:", response);

            // 5. Execute & Reply
            let finalReply = response.reply_text;

            if (response.action === "create_transaction") {
                const data = response.transaction_data;
                // Safety check for company_id
                if (!data.company_id) {
                    finalReply = "Por favor, informe a qual filial esse lançamento pertence: " + companies.map(c => c.name).join(", ");
                } else {
                    const tx = await base44.asServiceRole.entities.Transaction.create({
                        ...data,
                        status: data.status || 'pendente',
                        due_date: data.due_date || new Date().toISOString().split('T')[0]
                    });
                    base44.functions.invoke('recalculateBalance', { company_id: data.company_id });
                    finalReply = `✅ Lançamento criado com sucesso!\n${tx.description} - R$ ${tx.amount}`;
                }
            } else if (response.action === "read_transactions") {
                const list = await base44.asServiceRole.entities.Transaction.filter(response.filter_data || {}, '-created_date', 5);
                if (list.length > 0) {
                    finalReply += "\n\n" + list.map(t => `• ${t.description}: R$ ${t.amount} (${t.type})`).join("\n");
                } else {
                    finalReply += "\n(Nenhum lançamento recente encontrado)";
                }
            }

            // 6. Send to Telegram
            await sendTelegram(chatId, finalReply);

            // 7. Update History
            history.push({ role: "user", content: userText });
            history.push({ role: "assistant", content: finalReply });
            
            // Save session
            await base44.asServiceRole.entities.TelegramChatSession.update(session.id, {
                history: history
            });

            return Response.json({ status: "success" });

        } catch (error) {
            console.error("Webhook Error:", error);
            return Response.json({ error: error.message }, { status: 500 });
        }
    }

    return new Response("OK");
}

Deno.serve(telegramWebhook);