import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function processTelegramQueue(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) {
        console.error("[Queue] Missing TELEGRAM_BOT_TOKEN");
        return Response.json({ error: "No Token" }, { status: 500 });
    }
    
    const sendTelegram = async (chatId, text) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_Token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
            });
        } catch (e) { console.error("Send Error:", e); }
    };

    // New helper for typing status
    const sendAction = async (chatId, action = "typing") => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_Token}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action: action })
            });
        } catch (e) { console.error("Action Error:", e); }
    };

    try {
        const payload = await req.json();
        const queueItem = payload.data;
        if (!queueItem || !queueItem.user_text) {
            return Response.json({ status: "ignored", reason: "no_data" });
        }

        const { chat_id, user_text, id: queueId } = queueItem;

        // 0. Immediate Feedback: Show "Typing..." to user
        sendAction(chat_id, "typing");

        // 1. Session & History
        let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chat_id }))[0];
        if (!session) {
            session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id: chat_id, history: [] });
        }

        let history = session.history || [];
        if (history.length > 10) history = history.slice(-10);
        
        // 2. Load Context Data
        const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
        const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });
        
        const resolveCompanyId = (id) => {
            if (id) return id;
            if (companies.length === 1) return companies[0].id;
            return null;
        };

        const todayStr = new Date().toLocaleDateString('pt-BR');
        const historyText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
        
        // 3. Prompt - Optimized for humanization and conciseness
        let prompt = `Você é um assistente financeiro e de vendas SUPER AMIGÁVEL e EFICIENTE. ⚡️
        Personalidade: Use emojis (✅, 📊, 💰, etc), seja cordial, mas direto. Não seja robótico.
        
        Data de hoje: ${todayStr}
        
        CONTEXTO RECENTE:
        ${historyText}
        User: "${user_text}"

        DIRETRIZES:
        1. MULTI-FILIAL: Identifique a 'company_id' para ações. Se não souber, PERGUNTE com jeito (ex: "Para qual filial seria isso? 🏢").
        2. VENDAS: Siga o fluxo (Produto -> Cliente -> Valor -> Venda).
        3. RESPOSTAS: Gere o texto final no campo 'reply_text' já formatado para o usuário ler.

        DADOS DISPONÍVEIS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
        Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id})))}

        AÇÕES POSSÍVEIS:
        "reply" (conversa geral/perguntas), "create_transaction", "read_transactions", "read_balance", "search_products", "search_contacts", "create_contact", "create_sale".

        JSON RETORNO:
        {
            "action": "ação_escolhida",
            "reply_text": "Sua resposta amigável aqui...",
            "transaction_data": { ... },
            "filter_data": { "company_id": "...", ... },
            "search_query": "...",
            "contact_data": { ... },
            "sale_data": { ... }
        }
        `;

        // 4. Invoke AI
        let response;
        try {
            response = await base44.integrations.Core.InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        action: { type: "string" },
                        reply_text: { type: "string" },
                        transaction_data: { 
                            type: "object", 
                            properties: {
                                description: { type: "string" },
                                amount: { type: "number" },
                                type: { type: "string", enum: ["receita", "despesa"] },
                                category: { type: "string" },
                                company_id: { type: "string" },
                                status: { type: "string", enum: ["pago", "pendente", "parcial"] },
                                paid_amount: { type: "number" },
                                due_date: { type: "string" },
                                payment_date: { type: "string" }
                            },
                            required: ["description", "amount", "type", "category"] 
                        },
                        filter_data: { type: "object", additionalProperties: true },
                        search_query: { type: "string" },
                        contact_data: { type: "object", additionalProperties: true },
                        sale_data: { type: "object", additionalProperties: true }
                    },
                    required: ["action", "reply_text"]
                }
            });
        } catch (llmError) {
            await sendTelegram(chat_id, "Ops! Tive um probleminha técnico rápido. Pode repetir? 😅");
            return Response.json({ status: "llm_error" });
        }

        // 5. Execute Logic
        let finalReply = response.reply_text; // Default to LLM's humanized text
        const action = response.action;
        const filter = response.filter_data || {};

        // Resolve Company
        const cid = resolveCompanyId(
            (response.transaction_data?.company_id) || 
            (filter.company_id) || 
            (response.contact_data?.company_id) || 
            (response.sale_data?.company_id)
        );

        const needsCompany = ["create_transaction", "read_transactions", "read_balance", "search_products", "search_contacts", "create_contact", "create_sale"].includes(action);

        if (needsCompany && !cid) {
            finalReply = `Claro! Mas para qual filial devo olhar? 🏢\nOpções: ${companies.map(c => c.name).join(", ")}`;
        } 
        else {
            if (action === "create_transaction") {
                const data = response.transaction_data;
                data.company_id = cid;
                
                // Defaults
                const today = new Date().toISOString().split('T')[0];
                if (!data.due_date) data.due_date = today;
                if (data.status === 'pago') {
                    data.paid_amount = data.amount;
                    if (!data.payment_date) data.payment_date = today;
                }

                const tx = await base44.asServiceRole.entities.Transaction.create(data);
                base44.functions.invoke('recalculateBalance', { company_id: cid });
                
                // Humanized confirmation
                finalReply = `✅ Feito! Lançamento de *R$ ${tx.amount}* criado em *${companies.find(c=>c.id===cid)?.name}*.\n📝 ${tx.description}`;
            }
            
            else if (action === "read_transactions") {
                const query = { company_id: cid };
                if (filter.status) query.status = filter.status;
                // Simple date filter if provided
                if (filter.start_date) query.due_date = { $gte: filter.start_date };

                const list = await base44.asServiceRole.entities.Transaction.filter(query, '-due_date', 10);
                
                if (list.length > 0) {
                    finalReply = `📊 *Extrato Recente (${companies.find(c=>c.id===cid)?.name})*\n\n` + 
                        list.map(t => `${t.type==='receita'?'💰':'💸'} ${t.description}\n   R$ ${t.amount} (${t.status})`).join("\n\n");
                } else {
                    finalReply = `Não encontrei transações recentes nesta filial com esses filtros. 🧐`;
                }
            }
            
            else if (action === "read_balance") {
                const companyAccounts = accounts.filter(a => a.company_id === cid);
                if (companyAccounts.length === 0) {
                    finalReply = `Não achei contas cadastradas na filial ${companies.find(c=>c.id===cid)?.name}. 😕`;
                } else {
                    const total = companyAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
                    finalReply = `🏦 *Saldo Atual (${companies.find(c=>c.id===cid)?.name})*\n\n` + 
                        companyAccounts.map(a => `▫️ ${a.name}: R$ ${a.current_balance?.toFixed(2)}`).join("\n") +
                        `\n\n💰 *Total: R$ ${total.toFixed(2)}*`;
                }
            }

            else if (action === "search_products") {
                const query = response.search_query || "";
                const products = await base44.asServiceRole.entities.Product.filter({ 
                    name: { $regex: query, $options: 'i' },
                    company_id: cid,
                    is_active: true
                }, '-name', 10);
                
                if (products.length > 0) {
                    finalReply = `📦 *Produtos Encontrados (${companies.find(c=>c.id===cid)?.name})*:\n\n` + 
                        products.map(p => `▫️ ${p.name}\n   💲 R$ ${p.sale_price} | Estoque: ${p.current_stock} ${p.unit}`).join("\n\n");
                } else {
                    finalReply = `Não encontrei produtos com "${query}" aqui. 🔎`;
                }
            }
            
            // ... (Other actions like contacts/sales follow similar pattern, kept brief for this update)
            else if (action === "create_sale") {
                // Logic kept simple, assuming success creates a sale
                 const s = response.sale_data;
                 s.company_id = cid;
                 if (s.client_id && s.items?.length > 0) {
                    const ref = `V-${Date.now().toString().slice(-6)}`;
                    await base44.asServiceRole.entities.Sale.create({
                        reference: ref,
                        company_id: s.company_id,
                        client_id: s.client_id,
                        client_name: s.client_name,
                        items: s.items,
                        total: s.total,
                        status: 'concluida',
                        sale_date: new Date().toISOString().split('T')[0]
                    });
                    finalReply = `🎉 Venda *${ref}* registrada com sucesso na ${companies.find(c=>c.id===cid)?.name}!\nValor Total: R$ ${s.total}`;
                 } else {
                     finalReply = "Preciso de mais dados (cliente ou itens) para fechar a venda! 🛒";
                 }
            }
        }

        // 6. Response & Cleanup
        history.push({ role: "user", content: user_text });
        history.push({ role: "assistant", content: finalReply });
        await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history });
        await sendTelegram(chat_id, finalReply);

        try { await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId); } catch (e) {}

        return Response.json({ status: "success" });

    } catch (error) {
        console.error("Processor Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

Deno.serve(processTelegramQueue);