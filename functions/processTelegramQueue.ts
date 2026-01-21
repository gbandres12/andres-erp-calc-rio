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
            const res = await fetch(`https://api.telegram.org/bot${BOT_Token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
            await res.json();
        } catch (e) { console.error("Send Error:", e); }
    };

    try {
        const payload = await req.json();
        const queueItem = payload.data;
        if (!queueItem || !queueItem.user_text) {
            return Response.json({ status: "ignored", reason: "no_data" });
        }

        const { chat_id, user_text, id: queueId } = queueItem;

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
        
        // Helper to resolve company
        const resolveCompanyId = (id) => {
            if (id) return id;
            if (companies.length === 1) return companies[0].id;
            return null;
        };

        const todayStr = new Date().toLocaleDateString('pt-BR');
        const historyText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
        
        // 3. Prompt
        let prompt = `Você é um assistente financeiro e de vendas.
        Data de hoje: ${todayStr}
        
        CONTEXTO:
        ${historyText}
        User: "${user_text}"

        DIRETRIZES GERAIS (SEPARAÇÃO DE DADOS POR FILIAL):
        - O sistema é MULTI-FILIAL. Você NÃO deve misturar dados.
        - Para QUALQUER ação (busca, leitura, criação), você DEVE identificar a 'company_id'.
        - Se o usuário não informar a filial, PERGUNTE. (Ex: "De qual filial você quer ver o saldo?").
        - Se houver apenas uma filial na lista abaixo, use-a automaticamente.

        DIRETRIZES VENDAS:
        - FLUXO: 1. Identificar Produto -> 2. Identificar Cliente -> 3. Quantidade/Valor -> 4. Pagamento -> 5. Criar Venda.
        - BUSCAS: 'search_products' e 'search_contacts' DEVEM ter 'company_id' no filter_data.

        DADOS DISPONÍVEIS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
        Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id})))}

        AÇÕES:
        1. "reply": Perguntar ou responder (quando faltar filial, use isso).
        2. "create_transaction": Criar lançamento (exige company_id).
        3. "read_transactions": Consultar lançamentos (exige company_id).
        4. "read_balance": Consultar saldo (exige company_id).
        5. "search_products": Buscar produtos (exige company_id).
        6. "search_contacts": Buscar clientes (exige company_id).
        7. "create_contact": Criar contato (exige company_id).
        8. "create_sale": Criar venda (exige company_id).

        JSON FORMAT:
        {
            "action": "reply" | "create_transaction" | "read_transactions" | "read_balance" | "search_products" | "search_contacts" | "create_contact" | "create_sale",
            "reply_text": "Texto para o usuário",
            "transaction_data": { "description": string, "amount": number, "type": "receita"|"despesa", "category": string, "company_id": string, "status": "pago"|"pendente"|"parcial", "paid_amount": number, "due_date": string, "payment_date": string },
            "filter_data": { "company_id": string, "start_date": string, "end_date": string, "status": string, "account_id": string },
            "search_query": "termo",
            "contact_data": { "name": string, "type": "cliente"|"fornecedor", "document": string, "phone": string, "company_id": string },
            "sale_data": { "company_id": string, "client_id": string, "client_name": string, "items": [{"product_id": string, "product_name": string, "quantity": number, "unit_price": number, "total": number}], "total": number, "paid_amount": number, "payment_status": "pago"|"pendente"|"parcial" }
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
                        action: { type: "string", enum: ["reply", "create_transaction", "read_transactions", "read_balance", "search_products", "search_contacts", "create_contact", "create_sale"] },
                        reply_text: { type: "string" },
                        transaction_data: { type: "object", additionalProperties: true },
                        filter_data: { type: "object", additionalProperties: true },
                        search_query: { type: "string" },
                        contact_data: { type: "object", additionalProperties: true },
                        sale_data: { type: "object", additionalProperties: true }
                    },
                    required: ["action", "reply_text"]
                }
            });
        } catch (llmError) {
            await sendTelegram(chat_id, "Erro no processamento IA. Tente novamente.");
            return Response.json({ status: "llm_error" });
        }

        // 5. Execute
        let finalReply = response.reply_text;
        const action = response.action;
        const filter = response.filter_data || {};

        // --- ENFORCE COMPANY SEPARATION ---
        const cid = resolveCompanyId(
            (response.transaction_data?.company_id) || 
            (filter.company_id) || 
            (response.contact_data?.company_id) || 
            (response.sale_data?.company_id)
        );

        const needsCompany = ["create_transaction", "read_transactions", "read_balance", "search_products", "search_contacts", "create_contact", "create_sale"].includes(action);

        if (needsCompany && !cid) {
            finalReply = "Por favor, especifique de qual filial você está falando: " + companies.map(c => c.name).join(", ");
        } 
        else {
            // EXECUTE ACTIONS IF COMPANY RESOLVED
            
            if (action === "create_transaction") {
                const data = response.transaction_data;
                data.company_id = cid; // ensure
                
                // Defaults
                const today = new Date().toISOString().split('T')[0];
                if (!data.due_date) data.due_date = today;
                if (data.status === 'pago') {
                    data.paid_amount = data.amount;
                    if (!data.payment_date) data.payment_date = today;
                } else if (data.status === 'parcial') {
                    if (!data.payment_date) data.payment_date = today;
                } else {
                    data.paid_amount = 0;
                    data.payment_date = null;
                }

                if (data.status === 'parcial' && (data.paid_amount === undefined || data.paid_amount === null)) {
                    finalReply = "Pagamento parcial: Qual foi o valor pago?";
                } else {
                    const tx = await base44.asServiceRole.entities.Transaction.create(data);
                    base44.functions.invoke('recalculateBalance', { company_id: cid });
                    let icon = data.status === 'pago' ? '🟢' : data.status === 'parcial' ? '🟡' : '🔴';
                    finalReply = `✅ Lançamento em *${companies.find(c=>c.id===cid)?.name}*\n${tx.description}\nR$ ${tx.amount} (${icon} ${data.status})`;
                }
            }
            
            else if (action === "read_transactions") {
                const query = { company_id: cid }; // Strict filter
                if (filter.category) query.category = { $regex: filter.category, $options: 'i' };
                if (filter.type) query.type = filter.type;
                if (filter.status) query.status = filter.status;
                if (filter.start_date || filter.end_date) {
                    query.due_date = {};
                    if (filter.start_date) query.due_date.$gte = filter.start_date;
                    if (filter.end_date) query.due_date.$lte = filter.end_date;
                }

                const list = await base44.asServiceRole.entities.Transaction.filter(query, '-due_date', 15);
                
                if (list.length > 0) {
                    const total = list.reduce((acc, t) => acc + (t.type === 'receita' ? t.amount : -t.amount), 0);
                    finalReply = `📊 Extrato *${companies.find(c=>c.id===cid)?.name}*\n\n` + 
                        list.map(t => `${t.type==='receita'?'💰':'💸'} ${t.due_date?.split('-').reverse().slice(0,2).join('/')} - ${t.description}\n   R$ ${t.amount} (${t.status})`).join("\n\n") +
                        `\n\n*Total Líquido: R$ ${total.toFixed(2)}*`;
                } else {
                    finalReply = `Não encontrei transações nesta filial (${companies.find(c=>c.id===cid)?.name}) com os filtros atuais.`;
                }
            }
            
            else if (action === "read_balance") {
                const companyAccounts = accounts.filter(a => a.company_id === cid);
                if (companyAccounts.length === 0) {
                    finalReply = `Não há contas cadastradas na filial ${companies.find(c=>c.id===cid)?.name}.`;
                } else {
                    finalReply = `🏦 Saldo *${companies.find(c=>c.id===cid)?.name}*\n\n` + 
                        companyAccounts.map(a => `${a.name}: R$ ${a.current_balance}`).join("\n");
                }
            }

            else if (action === "search_products") {
                const query = response.search_query || "";
                // Searching products within the company
                const products = await base44.asServiceRole.entities.Product.filter({ 
                    name: { $regex: query, $options: 'i' },
                    company_id: cid, // Strict filter
                    is_active: true
                }, '-name', 10);
                
                if (products.length > 0) {
                    finalReply = `📦 Produtos em *${companies.find(c=>c.id===cid)?.name}*:\n\n` + 
                        products.map(p => `${p.name} (R$ ${p.sale_price}) [ID: ${p.id}]`).join("\n");
                } else {
                    finalReply = `Não encontrei produtos com "${query}" nesta filial.`;
                }
            }

            else if (action === "search_contacts") {
                const query = response.search_query || "";
                const contacts = await base44.asServiceRole.entities.Contact.filter({ 
                    name: { $regex: query, $options: 'i' },
                    company_id: cid, // Strict filter
                    is_active: true
                }, '-name', 10);
                
                if (contacts.length > 0) {
                    finalReply = `👤 Contatos em *${companies.find(c=>c.id===cid)?.name}*:\n\n` + 
                        contacts.map(c => `${c.name} (${c.type}) [ID: ${c.id}]`).join("\n");
                } else {
                    finalReply = `Não encontrei contatos com "${query}" nesta filial.`;
                }
            }

            else if (action === "create_contact") {
                if (!response.contact_data.name) {
                    finalReply = "Preciso do nome para cadastrar.";
                } else {
                    response.contact_data.company_id = cid; // ensure
                    const newContact = await base44.asServiceRole.entities.Contact.create({
                        ...response.contact_data,
                        is_active: true
                    });
                    finalReply = `✅ Contato cadastrado em *${companies.find(c=>c.id===cid)?.name}*: ${newContact.name}`;
                }
            }

            else if (action === "create_sale") {
                const s = response.sale_data;
                s.company_id = cid; // ensure
                if (!s.client_id || !s.items || s.items.length === 0) {
                    finalReply = "Faltam dados (cliente ou itens) para fechar a venda.";
                } else {
                    const ref = `V-${Date.now().toString().slice(-6)}`;
                    const sale = await base44.asServiceRole.entities.Sale.create({
                        reference: ref,
                        company_id: s.company_id,
                        client_id: s.client_id,
                        client_name: s.client_name,
                        items: s.items,
                        total: s.total,
                        paid_amount: s.paid_amount || 0,
                        payment_status: s.payment_status || 'pendente',
                        status: 'concluida',
                        sale_date: new Date().toISOString().split('T')[0]
                    });
                    finalReply = `🎉 *Venda Registrada na ${companies.find(c=>c.id===cid)?.name}*\nRef: ${sale.reference}\nTotal: R$ ${sale.total}`;
                }
            }
        }

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