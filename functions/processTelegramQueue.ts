import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';
import OpenAI from 'npm:openai';

export async function processTelegramQueue(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

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

        let { chat_id, user_text, id: queueId, media_type, voice_file_id } = queueItem;

        // --- Processamento de Voz (Whisper) ---
        if (media_type === "voice" && voice_file_id) {
            if (!OPENAI_API_KEY) {
                await sendTelegram(chat_id, "⚠️ Preciso da chave da OpenAI (OPENAI_API_KEY) configurada para transcrever áudios.");
                try { await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId); } catch(e){}
                return Response.json({ status: "missing_openai_key" });
            }

            await sendAction(chat_id, "record_voice"); // Mostra "gravando áudio..." como feedback

            try {
                // 1. Obter caminho do arquivo no Telegram
                const fileRes = await fetch(`https://api.telegram.org/bot${BOT_Token}/getFile?file_id=${voice_file_id}`);
                const fileData = await fileRes.json();
                if (!fileData.ok) throw new Error("Failed to get file path from Telegram");
                const filePath = fileData.result.file_path;

                // 2. Baixar o áudio
                const audioUrl = `https://api.telegram.org/file/bot${BOT_Token}/${filePath}`;
                const audioRes = await fetch(audioUrl);
                const audioBlob = await audioRes.blob();

                // 3. Transcrever com OpenAI Whisper
                const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
                const file = new File([audioBlob], "voice.ogg", { type: "audio/ogg" });

                const transcription = await openai.audio.transcriptions.create({
                    file: file,
                    model: "whisper-1",
                    language: "pt"
                });

                if (!transcription.text) throw new Error("Transcription empty");

                // Atualizar texto do usuário com a transcrição
                user_text = transcription.text;
                
                // Feedback visual do que foi entendido
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);

            } catch (voiceError) {
                console.error("Voice Processing Error:", voiceError);
                await sendTelegram(chat_id, "😓 Não consegui entender o áudio. Pode tentar escrever?");
                try { await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId); } catch(e){}
                return Response.json({ status: "voice_error" });
            }
        }
        // --------------------------------------

        // Feedback imediato
        sendAction(chat_id, "typing");

        // 1. Carregar ou Criar Sessão
        let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chat_id }))[0];
        if (!session) {
            session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id: chat_id, history: [] });
        }

        let history = session.history || [];
        if (history.length > 10) history = history.slice(-10);
        
        // 2. Dados de Contexto
        const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
        const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });
        
        // Recuperar filial da sessão ou tentar resolver
        let currentCompanyId = session.selected_company_id;
        const currentCompanyName = companies.find(c => c.id === currentCompanyId)?.name || "Nenhuma";

        const resolveCompanyId = (id) => {
            if (id) {
                // Validar se ID existe
                const exists = companies.find(c => c.id === id);
                return exists ? id : null;
            }
            if (currentCompanyId) return currentCompanyId;
            if (companies.length === 1) return companies[0].id;
            return null;
        };

        const todayStr = new Date().toLocaleDateString('pt-BR');
        const historyText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
        
        // 3. Prompt Refinado
        let prompt = `Você é o "FinanceiroBot" 🤖, assistente das filiais: ${companies.map(c => c.name).join(", ")}.
        
        Data: ${todayStr}
        Filial Ativa na Sessão: ${currentCompanyName} (ID: ${currentCompanyId || 'null'})
        
        CONTEXTO:
        ${historyText}
        User: "${user_text}"

        REGRAS CRÍTICAS:
        1. **FILIAL OBRIGATÓRIA**: Para gravar ou ler dados (transações, produtos, etc), você PRECISA de uma 'company_id'. 
           - Se o usuário NÃO disse a filial e NÃO tem "Filial Ativa", PERGUNTE.
           - Se o usuário mencionou uma filial, use o ID dela no JSON.
           - Se o usuário pediu para "mudar para filial X", atualize a filial.
        2. **DADOS COMPLETOS**: Não invente IDs. Use os fornecidos abaixo.

        DADOS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name, code: c.code})))}
        Contas: ${JSON.stringify(accounts.map(a => ({id: a.id, name: a.name, company_id: a.company_id})))}

        AÇÕES: "reply", "set_company", "create_transaction", "read_transactions", "read_balance", "search_products", "create_sale".

        RETORNO JSON (Estrito):
        {
            "action": "...",
            "reply_text": "...",
            "target_company_id": "ID da filial se identificada/alterada nesta mensagem (ou null)",
            "transaction_data": { "description": "...", "amount": 0.00, "type": "receita|despesa", "category": "...", "status": "...", "company_id": "..." },
            "filter_data": { "company_id": "..." },
            "search_query": "...",
            "sale_data": { ... }
        }
        `;

        // 4. Chamar LLM
        let response;
        try {
            response = await base44.integrations.Core.InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        action: { type: "string" },
                        reply_text: { type: "string" },
                        target_company_id: { type: "string" },
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
                        sale_data: { 
                            type: "object", 
                            properties: {
                                client_name: { type: "string" },
                                items: { 
                                    type: "array", 
                                    items: { 
                                        type: "object", 
                                        properties: {
                                            product_name: { type: "string" },
                                            quantity: { type: "number" }
                                        },
                                        required: ["product_name", "quantity"]
                                    } 
                                },
                                payment_method: { type: "string" }
                            },
                            required: ["client_name", "items"]
                        }
                    },
                    required: ["action", "reply_text"]
                }
            });
        } catch (llmError) {
            console.error("LLM Error:", llmError);
            await sendTelegram(chat_id, "😵‍💫 Minha mente deu um nó (Erro na IA). Pode repetir por favor?");
            // Importante: Deletar da fila para não travar, pois é erro de IA temporário
            try { await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId); } catch(e){}
            return Response.json({ status: "llm_error_handled" });
        }

        // 5. Executar Lógica
        let finalReply = response.reply_text;
        const action = response.action;
        let cid = resolveCompanyId(response.target_company_id || response.transaction_data?.company_id || response.filter_data?.company_id);

        // Atualizar sessão se mudou de filial
        if (response.target_company_id && response.target_company_id !== currentCompanyId) {
             const newCompany = companies.find(c => c.id === response.target_company_id);
             if (newCompany) {
                 await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: newCompany.id });
                 currentCompanyId = newCompany.id;
                 cid = newCompany.id; // Garantir uso
             }
        }

        const needsCompany = ["create_transaction", "read_transactions", "read_balance", "search_products", "create_sale"].includes(action);

        if (needsCompany && !cid) {
            finalReply = `🏢 *Qual filial?* Não sei em qual filial devo executar isso.\nOpções: ${companies.map(c => c.name).join(", ")}`;
        } 
        else {
            try {
                if (action === "create_transaction") {
                    const data = response.transaction_data;
                    data.company_id = cid; // Forçar ID resolvido/validado
                    
                    const today = new Date().toISOString().split('T')[0];
                    if (!data.due_date) data.due_date = today;
                    if (data.status === 'pago') {
                        data.paid_amount = data.amount;
                        if (!data.payment_date) data.payment_date = today;
                    }

                    const tx = await base44.asServiceRole.entities.Transaction.create(data);
                    base44.functions.invoke('recalculateBalance', { company_id: cid });
                    
                    finalReply = `✅ *Lançamento Criado na ${companies.find(c=>c.id===cid)?.name}*\n📝 ${tx.description}\n💰 R$ ${tx.amount} (${tx.type})`;
                }
                
                else if (action === "read_transactions") {
                    const query = { company_id: cid };
                    if (response.filter_data?.status) query.status = response.filter_data.status;
                    const list = await base44.asServiceRole.entities.Transaction.filter(query, '-due_date', 8);
                    
                    if (list.length > 0) {
                        finalReply = `📊 *Extrato ${companies.find(c=>c.id===cid)?.name}*\n` + 
                            list.map(t => `▪️ ${t.description} | R$ ${t.amount} (${t.status})`).join("\n");
                    } else {
                        finalReply = `Nada recente encontrado na filial ${companies.find(c=>c.id===cid)?.name}. 🦗`;
                    }
                }

                else if (action === "read_balance") {
                    const companyAccounts = accounts.filter(a => a.company_id === cid);
                    const total = companyAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
                    finalReply = `🏦 *Saldo ${companies.find(c=>c.id===cid)?.name}*\nTotal: *R$ ${total.toFixed(2)}*\n\n` + 
                        companyAccounts.map(a => `▫️ ${a.name}: R$ ${a.current_balance?.toFixed(2)}`).join("\n");
                }

                else if (action === "search_products") {
                    const query = response.search_query || "";
                    const products = await base44.asServiceRole.entities.Product.filter({ 
                        name: { $regex: query, $options: 'i' },
                        company_id: cid,
                        is_active: true
                    }, '-name', 10);
                    
                    if (products.length > 0) {
                        finalReply = `📦 *Produtos (${companies.find(c=>c.id===cid)?.name})*:\n` + 
                            products.map(p => `▫️ ${p.name} | R$ ${p.sale_price} | Est: ${p.current_stock}`).join("\n");
                    } else {
                        finalReply = `Nenhum produto "${query}" encontrado nesta filial.`;
                    }
                }

                else if (action === "create_sale") {
                    const { client_name, items, payment_method } = response.sale_data;
                    
                    // 1. Buscar Cliente
                    let client = (await base44.asServiceRole.entities.Contact.filter({
                        name: { $regex: client_name, $options: 'i' },
                        company_id: cid
                    }))[0];

                    if (!client) {
                        // Tentar criar se não achar? Por enquanto, avisar.
                        throw new Error(`Cliente "${client_name}" não encontrado. Cadastre-o primeiro.`);
                    }

                    // 2. Processar Itens
                    let saleItems = [];
                    let total = 0;
                    
                    for (const item of items) {
                        const product = (await base44.asServiceRole.entities.Product.filter({
                            name: { $regex: item.product_name, $options: 'i' },
                            company_id: cid
                        }))[0];

                        if (!product) throw new Error(`Produto "${item.product_name}" não encontrado.`);

                        const itemTotal = product.sale_price * item.quantity;
                        total += itemTotal;

                        saleItems.push({
                            product_id: product.id,
                            product_name: product.name,
                            quantity: item.quantity,
                            unit: product.unit,
                            unit_price: product.sale_price,
                            total: itemTotal,
                            quantity_withdrawn: 0 // Pendente de retirada
                        });

                        // Atualizar estoque (opcional, pode ser feito via trigger ou aqui mesmo)
                        // await base44.asServiceRole.entities.Product.update(product.id, { 
                        //     current_stock: (product.current_stock || 0) - item.quantity 
                        // });
                    }

                    // 3. Criar Venda
                    const sale = await base44.asServiceRole.entities.Sale.create({
                        reference: `VEN-${Date.now().toString().slice(-6)}`,
                        company_id: cid,
                        client_id: client.id,
                        client_name: client.name,
                        seller_name: "TelegramBot",
                        sale_date: new Date().toISOString().split('T')[0],
                        items: saleItems,
                        subtotal: total,
                        total: total,
                        payment_method: payment_method || "dinheiro",
                        status: "concluida",
                        payment_status: "pendente",
                        withdrawal_status: "aguardando"
                    });

                    finalReply = `✅ *Venda Realizada!* (Ref: ${sale.reference})\n👤 Cliente: ${client.name}\n💰 Total: R$ ${total.toFixed(2)}\n📦 Itens: ${saleItems.length}`;
                }

            } catch (logicError) {
                console.error("Logic/DB Error:", logicError);
                finalReply = `⚠️ *Erro ao processar*\nNão consegui concluir a ação no banco de dados. Verifique se os dados (valor, nome) estão corretos.`;
            }
        }

        // 6. Finalizar
        history.push({ role: "user", content: user_text });
        history.push({ role: "assistant", content: finalReply });
        
        // Atualiza histórico e deleta da fila SEMPRE (para não travar)
        await Promise.all([
            base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history }),
            sendTelegram(chat_id, finalReply),
            base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId)
        ]);

        return Response.json({ status: "success" });

    } catch (criticalError) {
        console.error("Critical System Error:", criticalError);
        // Se algo muito grave acontecer, tente limpar a fila se possível para não gerar loop
        try { 
            const payload = await req.json().catch(()=>null);
            if(payload?.data?.id) await base44.asServiceRole.entities.TelegramMessageQueue.delete(payload.data.id);
        } catch(e){}
        
        return Response.json({ error: criticalError.message }, { status: 500 });
    }
}

Deno.serve(processTelegramQueue);