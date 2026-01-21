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
        const todayStr = new Date().toLocaleDateString('pt-BR');
        
        let prompt = `Você é um assistente financeiro inteligente e direto.
        Data de hoje: ${todayStr}
        
        CONTEXTO:
        ${historyText}
        User: "${user_text}"

        DIRETRIZES:
        - FILIAL: Identifique a filial (Company) sempre que possível. Se não informado e necessário, PERGUNTE.
        - DATA (Lançamentos): Assuma hoje para 'due_date'/'payment_date' se não explícito.
        - STATUS: 'pago' (gastei, paguei), 'pendente' (boleto, conta), ou 'parcial'. Pergunte se faltar valor parcial.
        - CONSULTAS (read_transactions):
          - Identifique filtros de tempo: "hoje", "ontem", "este mês", "semana passada".
          - Converta esses períodos para 'start_date' e 'end_date' (YYYY-MM-DD) com base na data de hoje (${todayStr}).
          - Identifique filtros de: 'company_id', 'category', 'type' (receita/despesa).
        - Responda em JSON estrito.
        
        DADOS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
        Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id, balance: a.current_balance})))}

        AÇÕES:
        1. "reply": Responder texto simples.
        2. "create_transaction": Criar lançamento.
        3. "read_transactions": Consultar transações com filtros.
        4. "read_balance": Consultar saldo.

        JSON FORMAT:
        {
            "action": "reply" | "create_transaction" | "read_transactions" | "read_balance",
            "reply_text": "Texto para o usuário",
            "transaction_data": { 
                "amount": number, 
                "description": string, 
                "type": "receita"|"despesa", 
                "category": string, 
                "company_id": string,
                "status": "pago"|"pendente"|"parcial",
                "paid_amount": number,
                "due_date": string,
                "payment_date": string
            },
            "filter_data": {
                "start_date": string (YYYY-MM-DD),
                "end_date": string (YYYY-MM-DD),
                "company_id": string,
                "category": string,
                "type": "receita"|"despesa",
                "status": string,
                "account_id": string
            }
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
            let data = response.transaction_data;
            
            // Validation Logic
            if (!data.company_id) {
                finalReply = "Para qual filial devo lançar? (" + companies.map(c => c.name).join(", ") + ")";
            } 
            else if (data.status === 'parcial' && (data.paid_amount === undefined || data.paid_amount === null)) {
                finalReply = "Entendido, pagamento parcial. Qual foi o valor pago até agora?";
            }
            else {
                // Defaults and Logic adjustments
                const today = new Date().toISOString().split('T')[0];
                
                if (!data.due_date) data.due_date = today;
                
                if (data.status === 'pago') {
                    data.paid_amount = data.amount;
                    if (!data.payment_date) data.payment_date = today;
                } else if (data.status === 'parcial') {
                    if (!data.payment_date) data.payment_date = today;
                } else {
                    // pendente
                    data.paid_amount = 0;
                    data.payment_date = null;
                }

                const tx = await base44.asServiceRole.entities.Transaction.create({
                    ...data
                });
                
                // Trigger recalc asynchronously
                base44.functions.invoke('recalculateBalance', { company_id: data.company_id });
                
                let statusIcon = data.status === 'pago' ? '🟢' : data.status === 'parcial' ? '🟡' : '🔴';
                finalReply = `✅ *Lançamento Criado*\n${tx.description}\nValor: R$ ${tx.amount}\nStatus: ${statusIcon} ${data.status}\nFilial: ${companies.find(c=>c.id===tx.company_id)?.name}`;
            }
        } 
        else if (response.action === "read_transactions") {
            const f = response.filter_data || {};
            const query = {};
            
            // Build Query
            if (f.company_id) query.company_id = f.company_id;
            if (f.category) query.category = { $regex: f.category, $options: 'i' }; // Simple partial match if supported, or exact
            if (f.type) query.type = f.type;
            if (f.status) query.status = f.status;
            
            // Date Range (using due_date as the reference)
            if (f.start_date || f.end_date) {
                query.due_date = {};
                if (f.start_date) query.due_date.$gte = f.start_date;
                if (f.end_date) query.due_date.$lte = f.end_date;
            }

            console.log("[Queue] Querying Transactions:", JSON.stringify(query));

            const list = await base44.asServiceRole.entities.Transaction.filter(query, '-due_date', 15); // Increased limit to 15
            
            if (list.length > 0) {
                const total = list.reduce((acc, t) => acc + (t.type === 'receita' ? t.amount : -t.amount), 0);
                
                finalReply = response.reply_text || "Aqui estão as transações encontradas:";
                finalReply += "\n\n" + list.map(t => {
                    const icon = t.type === 'receita' ? '💰' : '💸';
                    const date = t.due_date ? t.due_date.split('-').reverse().slice(0,2).join('/') : '?';
                    return `${icon} ${date} - ${t.description}\n   R$ ${t.amount} (${t.status})`;
                }).join("\n\n");
                
                finalReply += `\n\n*Resultado Líquido (desta lista): R$ ${total.toFixed(2)}*`;
            } else {
                finalReply = response.reply_text || "Não encontrei transações com esses filtros.";
                finalReply += "\n(Tente mudar o período ou a filial)";
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