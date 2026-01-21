import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function processTelegramQueue(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) {
        console.error("[Queue] Missing TELEGRAM_BOT_TOKEN");
        return Response.json({ error: "No Token" }, { status: 500 });
    }
    
    console.log(`[Queue] Token present: ${BOT_Token.substring(0, 5)}...`);

    const sendTelegram = async (chatId, text) => {
        console.log(`[Queue] Sending to ${chatId}: ${text.substring(0, 20)}...`);
        try {
            const res = await fetch(`https://api.telegram.org/bot${BOT_Token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
            const data = await res.json();
            if (!data.ok) {
                console.error("[Queue] Telegram Send Failed:", data);
            } else {
                console.log("[Queue] Telegram Sent OK");
            }
        } catch (e) { console.error("Send Error:", e); }
    };

    try {
        const payload = await req.json();
        // payload = { event: { type: 'create', ... }, data: { ...entity_data... } }
        
        const queueItem = payload.data;
        if (!queueItem || !queueItem.user_text) {
            return Response.json({ status: "ignored", reason: "no_data" });
        }

        const { chat_id, user_text, id: queueId } = queueItem;

        console.log(`Processing Queue Item ${queueId} for Chat ${chat_id}`);

        // --- CORE LOGIC START ---

        // 1. Session & History
        let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chat_id }))[0];
        
        if (!session) {
            session = await base44.asServiceRole.entities.TelegramChatSession.create({
                chat_id: chat_id,
                history: []
            });
        }

        let history = session.history || [];
        if (history.length > 10) history = history.slice(-10);
        
        // 2. Load Context Data
        const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
        const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });
        
        // 3. Construct Prompt
        const historyText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
        
        let prompt = `Você é um assistente financeiro inteligente e direto.
        
        CONTEXTO:
        ${historyText}
        User: "${user_text}"

        DIRETRIZES:
        - Identifique a filial (Company) para qualquer lançamento.
        - Se o usuário não informou a filial, e não está claro no contexto, PERGUNTE.
        - Responda em JSON estrito.
        
        DADOS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
        Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id, balance: a.current_balance})))}

        AÇÕES:
        1. "reply": Responder texto simples.
        2. "create_transaction": Criar lançamento (apenas com: valor, tipo, categoria, filial_id).
        3. "read_transactions": Listar últimos lançamentos (filtro opcional).
        4. "read_balance": Consultar saldo de conta.

        JSON FORMAT:
        {
            "action": "reply" | "create_transaction" | "read_transactions" | "read_balance",
            "reply_text": "Texto para o usuário",
            "transaction_data": { ... } (if create),
            "filter_data": { ... } (if read/balance)
        }
        `;

        // 4. Invoke AI
        let response;
        try {
            console.log("[Queue] Invoking LLM...");
            response = await base44.integrations.Core.InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        action: { type: "string", enum: ["reply", "create_transaction", "read_transactions", "read_balance"] },
                        reply_text: { type: "string" },
                        transaction_data: { type: "object", additionalProperties: true },
                        filter_data: { type: "object", additionalProperties: true }
                    },
                    required: ["action", "reply_text"]
                }
            });
            console.log("[Queue] LLM Response:", JSON.stringify(response));
        } catch (llmError) {
            console.error("[Queue] LLM Error:", llmError);
            await sendTelegram(chat_id, "Desculpe, tive um problema ao processar seu pedido. Tente novamente.");
            return Response.json({ status: "llm_error" });
        }

        // 5. Execute & Prepare Reply
        let finalReply = response.reply_text || "Entendido.";

        if (response.action === "create_transaction") {
            const data = response.transaction_data;
            if (!data.company_id) {
                finalReply = "Para qual filial devo lançar? (" + companies.map(c => c.name).join(", ") + ")";
            } else {
                const tx = await base44.asServiceRole.entities.Transaction.create({
                    ...data,
                    status: data.status || 'pendente',
                    due_date: data.due_date || new Date().toISOString().split('T')[0]
                });
                // Trigger recalc asynchronously (fire and forget via function call if needed, or just let it be)
                base44.functions.invoke('recalculateBalance', { company_id: data.company_id });
                
                finalReply = `✅ *Lançamento Criado*\n${tx.description}\nValor: R$ ${tx.amount}\nFilial: ${companies.find(c=>c.id===tx.company_id)?.name}`;
            }
        } 
        else if (response.action === "read_transactions") {
            const list = await base44.asServiceRole.entities.Transaction.filter(response.filter_data || {}, '-created_date', 5);
            if (list.length > 0) {
                finalReply += "\n\n" + list.map(t => `▫️ ${t.description}: R$ ${t.amount} (${t.type})`).join("\n");
            } else {
                finalReply += "\n(Sem lançamentos recentes)";
            }
        }
        else if (response.action === "read_balance") {
            // Already have accounts in memory, but maybe filter fresh?
            // Let's rely on memory for speed or fetch specific if needed.
            // The AI might have asked for balance of a specific account in filter_data
            if (response.filter_data && response.filter_data.account_id) {
                const acc = accounts.find(a => a.id === response.filter_data.account_id);
                if (acc) finalReply += `\nSaldo Atual: R$ ${acc.current_balance}`;
            } else {
                // Show all relevant
                 finalReply += "\n" + accounts.map(a => `${a.name}: R$ ${a.current_balance}`).join("\n");
            }
        }

        // 6. Send Response & Update History & Cleanup (Parallelish)
        // We update history first to ensure we have record, then send, then delete queue
        
        history.push({ role: "user", content: user_text });
        history.push({ role: "assistant", content: finalReply });
        
        // Save history first
        await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history });

        // Send to Telegram
        await sendTelegram(chat_id, finalReply);

        // Cleanup Queue
        try {
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId);
            console.log(`[Queue] Deleted queue item ${queueId}`);
        } catch (e) {
            console.error(`[Queue] Failed to delete queue item ${queueId}:`, e);
        }

        return Response.json({ status: "success" });

    } catch (error) {
        console.error("Processor Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

Deno.serve(processTelegramQueue);