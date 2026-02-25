import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';
import OpenAI from 'npm:openai';

export async function processTelegramQueue(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const OPENAI_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("OPENAI_API_KEY");

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

    const sendPhoto = async (chatId, photoUrl, caption) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_Token}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption })
            });
        } catch (e) { console.error("Photo Error:", e); }
    };

    try {
        const payload = await req.json();
        const queueItem = payload.data;
        if (!queueItem || !queueItem.user_text) {
            return Response.json({ status: "ignored", reason: "no_data" });
        }

        let { chat_id, user_text, id: queueId, media_type, voice_file_id } = queueItem;
        chat_id = String(chat_id); // Garantir que é string para buscar sessão corretamente

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

                // 3. Transcrever com OpenAI Whisper (usando endpoint original da OpenAI se disponível, ou falhar graciosamente)
                // Nota: OpenRouter não tem endpoint de audio/transcriptions compatível diretamente com a lib da OpenAI as vezes
                // Vamos tentar usar a chave original se existir, ou pular se for só OpenRouter
                let transcriptionText = "";
                
                if (Deno.env.get("OPENAI_API_KEY")) {
                    const openaiAudio = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
                    const file = new File([audioBlob], "voice.ogg", { type: "audio/ogg" });
                    const transcription = await openaiAudio.audio.transcriptions.create({
                        file: file,
                        model: "whisper-1",
                        language: "pt"
                    });
                    transcriptionText = transcription.text;
                } else {
                   // Fallback ou aviso se não tiver OpenAI Key para Audio
                   throw new Error("Transscrição de áudio requer OPENAI_API_KEY (OpenRouter não suporta Whisper via SDK padrão ainda).");
                }

                if (!transcriptionText) throw new Error("Transcription empty");

                // Atualizar texto do usuário com a transcrição
                user_text = transcriptionText;

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

        // 2.1 Dados Financeiros (Se tiver filial definida)
        let financialContext = "Selecione uma filial para ver os dados financeiros.";
        let hasLateItems = false;
        
        if (currentCompanyId) {
            // BUSCA ABRANGENTE PARA O CONTEXTO DO AGENTE
            // Buscar totais macro para dar contexto real do módulo
            const [
                totalPayablePending, 
                totalPayableLate,
                totalReceivablePending,
                totalReceivableLate
            ] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'atrasado' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'atrasado' })
            ]);

            const sumPayablePending = totalPayablePending.reduce((sum, t) => sum + t.amount, 0);
            const sumPayableLate = totalPayableLate.reduce((sum, t) => sum + t.amount, 0);
            const sumReceivablePending = totalReceivablePending.reduce((sum, t) => sum + t.amount, 0);
            const sumReceivableLate = totalReceivableLate.reduce((sum, t) => sum + t.amount, 0);

            // Amostra de itens (limitado para não estourar contexto, mas focado nos maiores valores)
            // Ordenar por valor decrescente para mostrar os mais importantes
            const topLateExpenses = totalPayableLate.sort((a,b) => b.amount - a.amount).slice(0, 5);
            const topPendingExpenses = totalPayablePending.sort((a,b) => a.due_date.localeCompare(b.due_date)).slice(0, 5); // Próximos a vencer
            
            if (totalPayableLate.length > 0 || totalReceivableLate.length > 0) hasLateItems = true;

            const companyAccounts = accounts.filter(a => a.company_id === currentCompanyId);
            const totalBalance = companyAccounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);
            
            const formatTx = (t) => `- ${t.description} | ${t.contact_name || 'Fornecedor ñ ident.'} | R$ ${t.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})} | Venc: ${t.due_date.split('-').reverse().join('/')}`;
            
            financialContext = `
            📊 RESUMO GERAL DA FILIAL (${currentCompanyName}):
            
            💰 SALDO EM CAIXA/BANCOS: R$ ${totalBalance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}

            🔴 CONTAS A PAGAR (VISÃO MACRO):
               - TOTAL ATRASADO: R$ ${sumPayableLate.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${totalPayableLate.length} contas)
               - TOTAL A VENCER: R$ ${sumPayablePending.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${totalPayablePending.length} contas)
               = TOTAL GERAL DÍVIDA: R$ ${(sumPayableLate + sumPayablePending).toLocaleString('pt-BR', {minimumFractionDigits: 2})}

            🟢 CONTAS A RECEBER (VISÃO MACRO):
               - TOTAL ATRASADO: R$ ${sumReceivableLate.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
               - TOTAL A VENCER: R$ ${sumReceivablePending.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            
            ⚠️ PRINCIPAIS CONTAS ATRASADAS (TOP 5 VALORES):
            ${topLateExpenses.length ? topLateExpenses.map(formatTx).join("\n") : "(Nenhum atraso)"}
            
            📅 PRÓXIMAS CONTAS A VENCER (TOP 5):
            ${topPendingExpenses.length ? topPendingExpenses.map(formatTx).join("\n") : "(Nenhuma pendência próxima)"}
            `;
        }

        const todayStr = new Date().toLocaleDateString('pt-BR');
        
        // 3. Prompt Refinado (FINANCEIRO - OpenRouter)
        let systemPrompt = `Você é o "Assistente Financeiro Inteligente" da Calcário Amazônia 🚜.
        Você atende as filiais: ${companies.map(c => c.name).join(", ")}.
        
        Data de Hoje: ${todayStr}
        Filial Ativa: ${currentCompanyName} (ID: ${currentCompanyId || 'null'})
        Contas Disponíveis: ${accounts.filter(a => a.company_id === currentCompanyId).map(a => `${a.name} (ID: ${a.id})`).join(", ")}
        
        CONTEXTO FINANCEIRO EM TEMPO REAL:
        ${financialContext}

        SUA MISSÃO:
        Agir como um CFO proativo. Não apenas responda, ANALISE.
        Se houver contas atrasadas, ALERTE o usuário.
        Se o usuário pedir "contas a receber", foque no que está ABERTO (pendente/atrasado).
        Se pedir "extrato", mostre o histórico (pagos).
        
        REGRAS DE OURO:
        1. **Diferencie "Extrato" de "A Receber/Pagar"**:
           - "Contas a receber/pagar" = Itens com status 'pendente' ou 'atrasado'. (Use status: 'aberto' na busca).
           - "Extrato" ou "O que aconteceu" = Itens 'pago' ou 'todos'. (Use status: 'all' ou 'pago').
        2. **Proatividade**:
           - Se perceber contas atrasadas no contexto acima, mencione isso sutilmente: "Atenção: Temos contas atrasadas."
        3. **Formatação Monetária**: Sempre R$ X.XXX,XX (Padrão BR).
        4. **Ambiguidade**: Se o usuário disser apenas "financeiro", pergunte se ele quer ver o saldo, as contas a pagar ou a receber.
        
        AÇÕES DISPONÍVEIS (Retorne JSON):
        1. "reply": Apenas conversar/responder dúvidas.
        2. "set_company": Mudar filial.
        3. "search_products": Buscar produtos.
        4. "create_client": Cadastrar cliente.
        5. "create_sale": Criar venda.
        6. "add_expense": Lançar NOVA despesa/receita.
        7. "pay_bill": Dar baixa em conta existente.
        8. "search_finance": LISTAR contas. Use para "quais a receber?", "extrato", "gastos". (Configure status='aberto' para pendências).
        9. "generate_chart": Criar gráfico.

        ESTRUTURA JSON (Estrito):
        {
            "action": "uma das ações acima",
            "reply_text": "texto explicativo e analítico (use markdown)",
            "target_company_id": "ID da filial",
            
            // Para search_products
            "search_query": "termo",

            // Para add_expense
            "expense_data": { 
                "description": "ex: Almoço", 
                "amount": 50.00, 
                "type": "despesa" | "receita", 
                "category": "Alimentação", 
                "account_id": "ID da conta",
                "is_paid": true | false
            },

            // Para pay_bill
            "payment_data": {
                "search_term": "ex: Energia",
                "amount_approx": 150.00
            },

            // Para search_finance (MUITO IMPORTANTE ACERTAR OS FILTROS)
            "finance_query": {
                "type": "receita" | "despesa" | "all",
                "status": "pago" | "pendente" | "atrasado" | "aberto" | "all", 
                // Obs: 'aberto' busca pendentes + atrasados + parciais
                "category_contains": "termo ou null",
                "start_date": "YYYY-MM-DD",
                "end_date": "YYYY-MM-DD"
            },

            // Outros campos...
            "chart_data": { ... },
            "client_data": { ... },
            "sale_data": { ... }
        }
        `;

        // 4. Chamar LLM (OpenRouter)
        let response;
        try {
            const openai = new OpenAI({
                apiKey: OPENAI_API_KEY,
                baseURL: "https://openrouter.ai/api/v1"
            });

            // Estruturar mensagens corretamente para manter o histórico (thread)
            const messages = [
                { role: "system", content: systemPrompt },
                ...history.map(msg => ({ 
                    role: msg.role === 'user' ? 'user' : 'assistant', 
                    content: msg.content 
                })),
                { role: "user", content: user_text }
            ];

            const completion = await openai.chat.completions.create({
                model: "deepseek/deepseek-chat",
                messages: messages,
                response_format: { type: "json_object" }
            });
            
            const content = completion.choices[0].message.content;
            if (!content) throw new Error("Empty response from LLM");
            response = JSON.parse(content);

        } catch (llmError) {
            console.error("LLM Error:", llmError);
            await sendTelegram(chat_id, "😵‍💫 Erro na minha conexão neural (OpenRouter/LLM). Tente novamente.");
            try { await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId); } catch(e){}
            return Response.json({ status: "llm_error_handled" });
        }
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

        const needsCompany = ["search_products", "create_sale", "create_client", "add_expense", "pay_bill", "search_finance", "generate_chart"].includes(action);

        if (needsCompany && !cid) {
            finalReply = `🏢 *Qual filial?* Selecione a filial para prosseguir.\nOpções: ${companies.map(c => c.name).join(", ")}`;
        } 
        else {
            try {
                if (action === "create_client") {
                    const cData = response.client_data;
                    cData.company_id = cid;
                    cData.type = "cliente"; // Forçar tipo
                    
                    // Verificar duplicidade simples
                    const existing = (await base44.asServiceRole.entities.Contact.filter({ 
                        name: { $regex: cData.name, $options: 'i' }, 
                        company_id: cid 
                    }))[0];

                    if (existing) {
                        finalReply = `⚠️ *Cliente já existe!*\nEncontrei: ${existing.name} (Tel: ${existing.phone || 'N/A'})`;
                    } else {
                        const newClient = await base44.asServiceRole.entities.Contact.create(cData);
                        finalReply = `✅ *Cliente Cadastrado!* \n👤 ${newClient.name}\n📞 ${newClient.phone || 'Sem telefone'}\n📍 ${newClient.city || 'Sem cidade'}`;
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
                        finalReply = `📦 *Produtos (${companies.find(c=>c.id===cid)?.name})*:\n` + 
                            products.map(p => `▫️ ${p.name} | R$ ${p.sale_price.toLocaleString('pt-BR', {minimumFractionDigits: 2})} | Est: ${p.current_stock}`).join("\n");
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

                    finalReply = `✅ *Venda Realizada!* (Ref: ${sale.reference})\n👤 Cliente: ${client.name}\n💰 Total: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n📦 Itens: ${saleItems.length}`;
                }

                else if (action === "add_expense") {
                    const eData = response.expense_data;
                    const account = accounts.find(a => a.id === eData.account_id) || accounts.find(a => a.company_id === cid && a.type === 'caixa');
                    
                    const transaction = await base44.asServiceRole.entities.Transaction.create({
                        description: eData.description || "Despesa Avulsa",
                        amount: eData.amount,
                        original_amount: eData.amount,
                        type: eData.type || "despesa",
                        category: eData.category || "Geral",
                        status: eData.is_paid ? "pago" : "pendente",
                        paid_amount: eData.is_paid ? eData.amount : 0,
                        due_date: new Date().toISOString().split('T')[0], // Assume hoje
                        payment_date: eData.is_paid ? new Date().toISOString().split('T')[0] : null,
                        account_id: account?.id || null,
                        company_id: cid,
                        notes: "Lançado via TelegramBot"
                    });
                    
                    finalReply = `💸 *${eData.type === 'receita' ? 'Receita' : 'Despesa'} Lançada!* \n📝 ${transaction.description}\n💲 R$ ${eData.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n📅 ${eData.is_paid ? 'Pago' : 'Pendente'}`;
                }

                else if (action === "search_finance") {
                    const fQuery = response.finance_query;
                    const isOpenSearch = fQuery.status === 'aberto' || fQuery.status === 'pendente' || fQuery.status === 'atrasado';
                    
                    const filter = {
                         company_id: cid,
                         type: fQuery.type !== 'all' ? fQuery.type : undefined,
                         category: fQuery.category_contains ? { $regex: fQuery.category_contains, $options: 'i' } : undefined,
                         due_date: (fQuery.start_date || fQuery.end_date) ? {} : undefined
                    };

                    // Filtro de Status
                    if (fQuery.status && fQuery.status !== 'all') {
                        if (fQuery.status === 'aberto') {
                            filter.status = { $in: ['pendente', 'atrasado', 'parcial'] };
                        } else {
                            filter.status = fQuery.status;
                        }
                    }
                    
                    // Limpar undefineds
                    Object.keys(filter).forEach(key => filter[key] === undefined && delete filter[key]);
                    
                    // Adicionar range se existir
                    if (filter.due_date) {
                         if (fQuery.start_date) filter.due_date.$gte = fQuery.start_date;
                         if (fQuery.end_date) filter.due_date.$lte = fQuery.end_date;
                    }

                    // Ordenação inteligente: Abertos -> Vencimento Crescente (mais antigo primeiro). Extrato -> Data Decrescente (mais novo primeiro)
                    const sortOrder = isOpenSearch ? 'due_date' : '-due_date';
                    const txs = await base44.asServiceRole.entities.Transaction.filter(filter, sortOrder, 20);
                    
                    const total = txs.reduce((sum, t) => sum + t.amount, 0);
                    
                    if (txs.length > 0) {
                        // Agrupar visualmente
                        const iconMap = {
                            'receita': '💰',
                            'despesa': '💸'
                        };
                        const statusMap = {
                            'pago': '✅ Pago',
                            'pendente': '🟡 Pendente',
                            'atrasado': '🔴 Atrasado',
                            'parcial': '🟠 Parcial'
                        };

                        const lines = txs.map(t => {
                            const dateStr = t.due_date ? t.due_date.split('-').reverse().slice(0, 2).join('/') : 'S/D';
                            const valStr = `R$ ${t.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                            const typeIcon = iconMap[t.type] || '📄';
                            
                            // Destaque para atrasados
                            let prefix = "▪️";
                            if (t.status === 'atrasado') prefix = "🚨";
                            
                            return `${prefix} ${typeIcon} *${t.description}*\n   └ ${valStr} | ${statusMap[t.status] || t.status} | ${dateStr}`;
                        });

                        const title = isOpenSearch ? "📅 *Contas em Aberto / A Receber*" : "📊 *Extrato / Histórico*";
                        finalReply = `${title}\n\n${lines.join("\n")}\n\n------------------\n*Total Listado: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}*`;
                        
                        if (isOpenSearch && txs.some(t => t.status === 'atrasado')) {
                            finalReply += "\n\n⚠️ *Atenção:* Existem contas atrasadas na lista!";
                        }

                    } else {
                        finalReply = `🔍 *Nada encontrado.* \nNão encontrei nenhuma transação com os critérios:\n- Tipo: ${fQuery.type}\n- Status: ${fQuery.status}\n- Filial Atual`;
                    }
                }

                else if (action === "pay_bill") {
                     const pData = response.payment_data;
                     // Tentar achar conta pendente parecida
                     const pending = await base44.asServiceRole.entities.Transaction.filter({
                         company_id: cid,
                         status: { $in: ['pendente', 'atrasado', 'parcial'] },
                         description: { $regex: pData.search_term || "", $options: 'i' }
                     });
                     
                     // Filtrar por valor aproximado se fornecido (margem 10%)
                     const match = pending.find(t => {
                         if (!pData.amount_approx) return true;
                         const diff = Math.abs(t.amount - pData.amount_approx);
                         return diff < (t.amount * 0.1);
                     });

                     if (match) {
                         await base44.asServiceRole.entities.Transaction.update(match.id, {
                             status: 'pago',
                             paid_amount: match.amount,
                             payment_date: new Date().toISOString().split('T')[0],
                             notes: (match.notes || "") + "\nBaixa via TelegramBot"
                         });
                         finalReply = `✅ *Conta Paga!* \nDei baixa em: ${match.description} (R$ ${match.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})})`;
                     } else {
                         finalReply = `⚠️ Não encontrei conta pendente parecida com "${pData.search_term}"${pData.amount_approx ? ` de aprox R$ ${pData.amount_approx.toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : ''}.`;
                     }
                }

                else if (action === "generate_chart") {
                    const cData = response.chart_data;
                    
                    // Configuração do QuickChart
                    const chartConfig = {
                        type: cData.type,
                        data: {
                            labels: cData.labels,
                            datasets: cData.datasets.map((ds, idx) => ({
                                label: ds.label,
                                data: ds.data,
                                backgroundColor: idx === 0 ? 'rgba(54, 162, 235, 0.5)' : 'rgba(255, 99, 132, 0.5)',
                                borderColor: idx === 0 ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 99, 132, 1)',
                                borderWidth: 1
                            }))
                        },
                        options: {
                            title: { display: true, text: cData.title },
                            legend: { display: true },
                            plugins: {
                                datalabels: { display: true, anchor: 'end', align: 'top' }
                            }
                        }
                    };

                    const quickChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=500&height=300&backgroundColor=white`;
                    
                    // Envia a foto primeiro
                    await sendPhoto(chat_id, quickChartUrl, response.reply_text || "📊 Gráfico gerado com sucesso.");
                    
                    // Se o bot também mandou texto, usa ele, senão confirmação simples
                    if (!response.reply_text) finalReply = "Gráfico enviado acima 👆";
                }

            } catch (logicError) {
                console.error("Logic/DB Error:", logicError);
                finalReply = `⚠️ *Erro ao processar*\n${logicError.message || "Erro desconhecido no banco de dados."}`;
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