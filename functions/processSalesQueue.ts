import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';
import OpenAI from 'npm:openai';
import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.12.0";

export async function processSalesQueue(req) {
    const base44 = createClientFromRequest(req);
    const SALES_BOT_TOKEN = Deno.env.get("SALES_BOT_TOKEN");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SALES_BOT_TOKEN) return Response.json({ error: "Missing SALES_BOT_TOKEN" }, { status: 500 });

    const sendTelegram = async (chatId, text) => {
        try {
            await fetch(`https://api.telegram.org/bot${SALES_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
            });
        } catch (e) { console.error("Send Error:", e); }
    };

    const sendAction = async (chatId, action = "typing") => {
        try {
            await fetch(`https://api.telegram.org/bot${SALES_BOT_TOKEN}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action: action })
            });
        } catch (e) { console.error("Action Error:", e); }
    };

    try {
        // 1. Pegar item da fila (Busca o mais antigo não processado ou recebe via payload)
        // Aqui vamos simplificar e buscar da fila baseada no payload ou pegar o primeiro
        const payload = await req.json().catch(() => ({}));
        let queueItem;

        if (payload.data?.message_id) {
            const items = await base44.asServiceRole.entities.SalesTelegramQueue.filter({ message_id: payload.data.message_id });
            queueItem = items[0];
        } else {
            // Fallback: pega o mais antigo
            const items = await base44.asServiceRole.entities.SalesTelegramQueue.list("created_date", 1);
            queueItem = items[0];
        }

        if (!queueItem) return Response.json({ status: "empty_queue" });

        const { id: queueId, chat_id, user_text, media_type, voice_file_id } = queueItem;
        sendAction(chat_id, "typing");

        let finalUserText = user_text;

        // --- Processamento de Voz (Opcional - Requer OpenAI Key original para Whisper) ---
        if (media_type === "voice" && voice_file_id) {
            // Nota: OpenRouter não suporta Whisper via SDK padrão da OpenAI facilmente.
            // Se tiver a chave da OpenAI, usamos. Se não, avisamos.
            const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
            if (OPENAI_KEY) {
                try {
                    const fileRes = await fetch(`https://api.telegram.org/bot${SALES_BOT_TOKEN}/getFile?file_id=${voice_file_id}`);
                    const fileData = await fileRes.json();
                    const audioUrl = `https://api.telegram.org/file/bot${SALES_BOT_TOKEN}/${fileData.result.file_path}`;
                    const audioBlob = await (await fetch(audioUrl)).blob();
                    
                    const openaiAudio = new OpenAI({ apiKey: OPENAI_KEY });
                    const transcription = await openaiAudio.audio.transcriptions.create({
                        file: new File([audioBlob], "voice.ogg", { type: "audio/ogg" }),
                        model: "whisper-1",
                        language: "pt"
                    });
                    finalUserText = transcription.text;
                    await sendTelegram(chat_id, `🎤 *Ouvi:* "${finalUserText}"`);
                } catch (e) {
                    console.error("Voice Error", e);
                    await sendTelegram(chat_id, "⚠️ Erro ao processar áudio.");
                }
            } else {
                await sendTelegram(chat_id, "⚠️ Áudio não suportado sem OPENAI_API_KEY configurada (apenas texto por enquanto).");
            }
        }
        // --------------------------------------------------------------------------------

        // 2. Contexto e Sessão (Busca Paralela para Velocidade)
        const [sessions, companies] = await Promise.all([
            base44.asServiceRole.entities.SalesTelegramSession.filter({ chat_id: chat_id }),
            base44.asServiceRole.entities.Company.filter({ is_active: true })
        ]);

        let session = sessions[0];
        if (!session) {
            session = await base44.asServiceRole.entities.SalesTelegramSession.create({ chat_id: chat_id, history: [] });
        }
        
        // Resolver Filial
        let currentCompanyId = session.selected_company_id;
        let currentCompanyName = companies.find(c => c.id === currentCompanyId)?.name || "Nenhuma";

        // Histórico
        let history = session.history || [];
        const historyText = history.slice(-10).map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`).join("\n");

        // 3. Prompt Otimizado
        const systemPrompt = `Você é o "Vendedor Virtual" da Andres Tech.
        Seu público são pessoas mais velhas e tradicionais. Fale de forma simples e paciente.
        Filial Atual: ${currentCompanyName} (ID: ${currentCompanyId || 'null'})
        Hoje: ${new Date().toLocaleDateString('pt-BR')}
        
        DADOS DISPONÍVEIS:
        Filiais: ${JSON.stringify(companies.map(c => ({id: c.id, name: c.name})))}
        
        PERSONALIDADE:
        - Extremamente educado, paciente e respeitoso (use "Senhor/Senhora").
        - Fale de forma simples, clara e direta.
        - Faça UMA pergunta de cada vez. Não atropele a conversa.
        
        FLUXO DE ATENDIMENTO OBRIGATÓRIO (Passo a Passo):
        1. Identificação da Filial (se não souber).
        2. Identificação do Cliente: 
           - Pergunte gentilmente se ele já é nosso cliente.
           - Se JÁ FOR: Pergunte o nome completo para verificar.
           - Se NÃO FOR: Peça os dados (Nome, Cidade, Telefone) com calma, um dado por vez se necessário.
        3. Pedido:
           - Pergunte qual produto ele deseja.
           - Pergunte especificamente a quantidade ("quantas toneladas" ou "quantos quilos" o senhor precisa?).
        4. Pagamento: Confirme como ele prefere pagar.
        5. Fechamento: Só então gere a venda.

        AÇÕES (JSON):
        - "reply": Responder texto.
        - "set_company": Definir filial (target_id).
        - "search_products": Buscar produtos (query).
        - "create_client": Cadastrar (client_data: name, phone, city).
        - "create_sale": Criar venda (sale_data: client_name, items[{product_name, qty}], payment_method).
        
        MÉTODOS DE PAGAMENTO: "dinheiro", "pix", "transferencia", "cartao_debito", "cartao_credito", "cheque".

        OUTPUT JSON ESTRITO APENAS.
        `;

        // Seleção de Modelo com Fallback Robusto (OpenAI -> Gemini)
        let responseContent;
        let usedProvider = "none";

        const tryGemini = async () => {
             if (!GEMINI_API_KEY) throw new Error("Gemini API Key missing");
             
             const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
             const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash",
                systemInstruction: systemPrompt,
                generationConfig: { responseMimeType: "application/json" }
             });
             
             usedProvider = "gemini";
             const result = await model.generateContent(`Histórico:\n${historyText}\n\nUsuário atual: ${finalUserText}`);
             return result.response.text();
        };

        if (OPENAI_API_KEY) {
            try {
                // Tenta OpenAI Primeiro
                const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Histórico:\n${historyText}\n\nUsuário atual: ${finalUserText}` }
                    ],
                    response_format: { type: "json_object" }
                });
                usedProvider = "openai";
                responseContent = completion.choices[0].message.content;
            } catch (err) {
                console.warn("OpenAI Failed (Quota/Error), falling back to Gemini:", err.message);
                // Fallback para Gemini se falhar
                responseContent = await tryGemini();
            }
        } else {
            // Se não tem OpenAI, vai direto pro Gemini
            responseContent = await tryGemini();
        }
        // Sanitize response content (remove markdown code blocks if present)
        const cleanContent = responseContent.replace(/```json\n?|```/g, '').trim();

        let responseJson;
        try {
            responseJson = JSON.parse(cleanContent);
        } catch (e) {
            // Fallback se não vier JSON puro
            console.error("JSON Parse Error", e, "Content:", responseContent);
            responseJson = { action: "reply", reply_text: cleanContent };
        }

        // 4. Executar Ação
        let replyText = responseJson.reply_text;
        
        // Se não houver texto de resposta, usar um padrão melhor ou o próprio conteúdo se não for JSON
        if (!replyText) {
             if (responseJson.action === "reply" && !responseJson.reply_text) {
                 replyText = "Desculpe, não entendi. Poderia repetir?";
             } else {
                 replyText = "Comando processado.";
             }
        }
        const action = responseJson.action;
        let cid = currentCompanyId;

        // Lógica de Troca de Filial
        if (responseJson.target_company_id || action === "set_company") {
            const targetId = responseJson.target_company_id || responseJson.filter_data?.company_id;
            const newComp = companies.find(c => c.id === targetId);
            if (newComp) {
                cid = newComp.id;
                currentCompanyId = cid;
                await base44.asServiceRole.entities.SalesTelegramSession.update(session.id, { selected_company_id: cid });
                if (action === "set_company") replyText = `🏢 Filial definida: *${newComp.name}*`;
            }
        }

        if (["search_products", "create_sale", "create_client"].includes(action) && !cid) {
            replyText = `🏢 Por favor, selecione a filial primeiro:\n${companies.map(c => `- ${c.name}`).join("\n")}`;
        } else {
            // Execuções com Filial Definida
            try {
                if (action === "search_products") {
                    const query = responseJson.search_query || "";
                    const prods = await base44.asServiceRole.entities.Product.filter({
                        name: { $regex: query, $options: 'i' },
                        company_id: cid,
                        is_active: true
                    }, '-name', 5);
                    
                    if (prods.length > 0) {
                        replyText = `📦 *Produtos Encontrados:*\n` + prods.map(p => `• ${p.name}\n  💰 R$ ${p.sale_price} | Est: ${p.current_stock}`).join("\n");
                    } else {
                        replyText = `🔍 Nenhum produto encontrado para "${query}".`;
                    }
                }
                else if (action === "create_client") {
                    const cData = responseJson.client_data;
                    cData.company_id = cid;
                    cData.type = "cliente";
                    // Checar duplicidade simples
                    const existing = (await base44.asServiceRole.entities.Contact.filter({ name: cData.name, company_id: cid }))[0];
                    if (existing) {
                        replyText = `⚠️ Cliente *${existing.name}* já existe!`;
                    } else {
                        const newClient = await base44.asServiceRole.entities.Contact.create(cData);
                        replyText = `✅ *Cliente Cadastrado!* \n👤 ${newClient.name}`;
                    }
                }
                else if (action === "create_sale") {
                    const sData = responseJson.sale_data;
                    // Buscar cliente
                    const client = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: sData.client_name, $options: 'i' }, company_id: cid }))[0];
                    
                    if (!client) {
                        replyText = `❌ Cliente "${sData.client_name}" não encontrado. Cadastre-o primeiro.`;
                    } else {
                        let total = 0;
                        let items = [];
                        for (const item of sData.items) {
                            const prod = (await base44.asServiceRole.entities.Product.filter({ name: { $regex: item.product_name, $options: 'i' }, company_id: cid }))[0];
                            if (prod) {
                                const sub = prod.sale_price * item.quantity;
                                total += sub;
                                items.push({
                                    product_id: prod.id,
                                    product_name: prod.name,
                                    quantity: item.quantity,
                                    unit: prod.unit,
                                    unit_price: prod.sale_price,
                                    total: sub
                                });
                            }
                        }
                        
                        if (items.length === 0) {
                            replyText = "❌ Nenhum produto válido identificado.";
                        } else {
                            const sale = await base44.asServiceRole.entities.Sale.create({
                                reference: `BOT-${Date.now().toString().slice(-6)}`,
                                company_id: cid,
                                client_id: client.id,
                                client_name: client.name,
                                seller_name: "SalesBot",
                                sale_date: new Date().toISOString().split('T')[0],
                                items: items,
                                total: total,
                                subtotal: total,
                                payment_method: sData.payment_method || "dinheiro",
                                status: "concluida"
                            });
                            replyText = `✅ *Venda Realizada!* (Ref: ${sale.reference})\n💰 Total: R$ ${total.toFixed(2)}`;
                        }
                    }
                }
            } catch (err) {
                console.error("Action Error", err);
                replyText = "⚠️ Ocorreu um erro ao processar sua solicitação no sistema.";
            }
        }

        // 5. Finalizar e Responder
        await sendTelegram(chat_id, replyText);
        
        // Atualizar histórico
        history.push({ role: "user", content: finalUserText });
        history.push({ role: "assistant", content: replyText });
        await base44.asServiceRole.entities.SalesTelegramSession.update(session.id, { history });

        // Remover da fila
        await base44.asServiceRole.entities.SalesTelegramQueue.delete(queueId);

        return Response.json({ status: "success" });

    } catch (criticalError) {
        console.error("Critical:", criticalError);
        return Response.json({ error: criticalError.message }, { status: 500 });
    }
}

Deno.serve(processSalesQueue);