import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'; // v4-flash

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    console.error(`[INIT] BOT=${BOT_TOKEN ? 'OK' : 'MISSING'} | GEMINI=${GEMINI_API_KEY ? 'OK' : 'MISSING'}`);

    if (!BOT_TOKEN) {
        return Response.json({ error: "No BOT_TOKEN" }, { status: 500 });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    const sendTelegram = async (chatId, text) => {
        try {
            const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
            });
            const j = await r.json();
            if (!j.ok) console.error(`[SEND] Error: ${JSON.stringify(j)}`);
        } catch (e) { console.error("[SEND] Exception:", e.message); }
    };

    const sendAction = async (chatId, action = "typing") => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action })
            });
        } catch (e) { console.error("[ACTION] Exception:", e.message); }
    };

    const sendPhoto = async (chatId, photoUrl, caption) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
            });
        } catch (e) { console.error("[PHOTO] Exception:", e.message); }
    };

    // ── Parse payload ─────────────────────────────────────────────────────────
    let payload;
    try {
        payload = await req.json();
    } catch (e) {
        console.error("[PAYLOAD] Parse error:", e.message);
        return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const queueItem = payload.data;
    if (!queueItem || !queueItem.user_text) {
        return Response.json({ status: "ignored", reason: "no_data" });
    }

    let { chat_id, user_text, id: queueId, media_type, voice_file_id, photo_file_id } = queueItem;
    chat_id = String(chat_id);

    console.error(`[MSG] chat=${chat_id} | type=${media_type} | text="${user_text?.slice(0,60)}"`);

    // ── Multimedia processing (Gemini) ────────────────────────────────────────
    if ((media_type === "voice" && voice_file_id) || (media_type === "photo" && photo_file_id)) {
        if (!GEMINI_API_KEY) {
            await sendTelegram(chat_id, "⚠️ GEMINI_API_KEY não configurada. Contate o administrador.");
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: "missing_gemini_key" });
        }

        const isVoice = media_type === "voice";
        await sendAction(chat_id, isVoice ? "record_voice" : "upload_photo");

        try {
            // 1. Get file path from Telegram
            const fileId = isVoice ? voice_file_id : photo_file_id;
            console.error(`[MEDIA] Getting file from Telegram. fileId=${fileId}`);
            const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            console.error(`[MEDIA] Telegram getFile response: ok=${fileData.ok} path=${fileData.result?.file_path}`);
            if (!fileData.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(fileData)}`);

            // 2. Download file
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
            console.error(`[MEDIA] Downloading from: ${fileUrl}`);
            const fileResp = await fetch(fileUrl);
            if (!fileResp.ok) throw new Error(`File download failed: ${fileResp.status}`);
            const arrayBuffer = await fileResp.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            console.error(`[MEDIA] Downloaded ${bytes.byteLength} bytes`);

            // 3. Convert to base64 (pure Deno, no Node Buffer)
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Data = btoa(binary);
            console.error(`[MEDIA] Base64 encoded. Length=${base64Data.length}`);

            // 4. Call Gemini
            const mimeType = isVoice ? "audio/ogg" : "image/jpeg";
            const prompt = isVoice
                ? "Transcreva este áudio para texto em português. Responda APENAS com o texto transcrito, sem prefixos ou explicações. Se não houver fala clara, responda '[Áudio inaudível]'."
                : "Descreva esta imagem detalhadamente em português. Se for um comprovante, nota fiscal ou documento financeiro, extraia: valor total, data, nome do estabelecimento/fornecedor e descrição do item. Se for outra coisa, descreva o que vê de forma útil para um contexto financeiro empresarial.";

            console.error(`[GEMINI] Sending ${mimeType} to Gemini 1.5 Flash...`);
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const result = await geminiModel.generateContent([
                { inlineData: { mimeType, data: base64Data } },
                prompt
            ]);

            const processedText = result.response.text();
            console.error(`[GEMINI] Result: "${processedText?.slice(0, 200)}"`);
            if (!processedText) throw new Error("Empty response from Gemini");

            // 5. Update user_text for LLM context
            if (isVoice) {
                user_text = processedText;
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
            } else {
                const caption = user_text && user_text !== "[Photo Message]" ? `Legenda: ${user_text}\n` : "";
                user_text = `${caption}[Análise da Imagem]: ${processedText}`;
                await sendTelegram(chat_id, `📷 *Analisei a imagem:*\n${processedText}`);
            }

        } catch (mediaError) {
            console.error("[MEDIA ERROR]", mediaError.message, mediaError.stack);
            await sendTelegram(chat_id, `😓 Não consegui processar o ${isVoice ? "áudio" : "imagem"}.\n\nErro: ${mediaError.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: "media_error", error: mediaError.message });
        }
    }

    // ── Main LLM flow (Gemini for text/agent) ────────────────────────────────
    sendAction(chat_id, "typing");

    // Load or create session
    let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }))[0];
    if (!session) {
        session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });
    }

    let history = (session.history || []).slice(-10);

    // Context data
    const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });
    const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true });

    let currentCompanyId = session.selected_company_id;
    const currentCompanyName = companies.find(c => c.id === currentCompanyId)?.name || "Nenhuma";

    const resolveCompanyId = (id) => {
        if (id) return companies.find(c => c.id === id) ? id : null;
        if (currentCompanyId) return currentCompanyId;
        if (companies.length === 1) return companies[0].id;
        return null;
    };

    // Financial context
    let financialContext = "Selecione uma filial para ver os dados financeiros.";
    if (currentCompanyId) {
        const [payablePending, payableLate, receivablePending, receivableLate] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'atrasado' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'atrasado' })
        ]);

        const sumPP = payablePending.reduce((s, t) => s + t.amount, 0);
        const sumPL = payableLate.reduce((s, t) => s + t.amount, 0);
        const sumRP = receivablePending.reduce((s, t) => s + t.amount, 0);
        const sumRL = receivableLate.reduce((s, t) => s + t.amount, 0);

        const topLate = payableLate.sort((a, b) => b.amount - a.amount).slice(0, 5);
        const topPending = payablePending.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5);

        const companyAccounts = accounts.filter(a => a.company_id === currentCompanyId);
        const totalBalance = companyAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);

        const fmt = (t) => `- ${t.description} | ${t.contact_name || 'Sem contato'} | R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Venc: ${(t.due_date || '').split('-').reverse().join('/')}`;

        financialContext = `
💰 SALDO EM CAIXA/BANCOS: R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

🔴 CONTAS A PAGAR:
   - Atrasado: R$ ${sumPL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${payableLate.length} contas)
   - A vencer: R$ ${sumPP.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${payablePending.length} contas)

🟢 CONTAS A RECEBER:
   - Atrasado: R$ ${sumRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
   - A vencer: R$ ${sumRP.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

⚠️ PRINCIPAIS CONTAS ATRASADAS (TOP 5):
${topLate.length ? topLate.map(fmt).join("\n") : "(Nenhum atraso)"}

📅 PRÓXIMAS A VENCER (TOP 5):
${topPending.length ? topPending.map(fmt).join("\n") : "(Nenhuma pendência próxima)"}`;
    }

    const todayStr = new Date().toLocaleDateString('pt-BR');

    const systemPrompt = `Você é o AGENTE FINANCEIRO EXECUTIVO da empresa. Data de hoje: ${todayStr}.
Filiais: ${companies.map(c => `${c.name} (ID: ${c.id})`).join(", ")}
Filial Ativa: ${currentCompanyName} (ID: ${currentCompanyId || 'null'})
Contas: ${accounts.filter(a => a.company_id === currentCompanyId).map(a => `${a.name} (ID: ${a.id})`).join(", ")}

CONTEXTO FINANCEIRO:
${financialContext}

MISSÃO: Registrar receitas/despesas, controlar pendências, monitorar saldo, alertar riscos de caixa.
Toda operação exige filial definida. Se não informada, pergunte.

AÇÕES DISPONÍVEIS (responda SEMPRE em JSON válido):
1. "reply" - Responder/conversar
2. "set_company" - Mudar filial
3. "add_expense" - Lançar nova despesa ou receita
4. "pay_bill" - Dar baixa em conta existente
5. "search_finance" - Listar/pesquisar transações
6. "generate_chart" - Gerar gráfico
7. "create_client" - Cadastrar cliente
8. "create_sale" - Criar venda
9. "search_products" - Buscar produtos

ESTRUTURA JSON (retorne APENAS o JSON, sem markdown):
{
  "action": "ação",
  "reply_text": "texto para o usuário (use markdown)",
  "target_company_id": "ID ou null",
  "expense_data": { "description": "", "amount": 0, "type": "despesa|receita", "category": "", "account_id": "", "is_paid": false },
  "payment_data": { "search_term": "", "amount_approx": 0 },
  "finance_query": { "type": "receita|despesa|all", "status": "pago|pendente|atrasado|aberto|all", "category_contains": null, "start_date": null, "end_date": null },
  "chart_data": { "type": "bar|line|pie", "title": "", "labels": [], "datasets": [] },
  "client_data": {},
  "sale_data": {}
}`;

    // Call Gemini LLM
    let response;
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const chatHistory = [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: '{"action":"reply","reply_text":"Entendido. Sou o Agente Financeiro Executivo. Aguardo suas solicitações.","target_company_id":null}' }] },
            ...history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }))
        ];

        console.error(`[LLM] Sending to Gemini. History size=${history.length}`);
        const chat = geminiModel.startChat({
            history: chatHistory,
            generationConfig: { responseMimeType: "application/json" }
        });

        const result = await chat.sendMessage(user_text);
        const content = result.response.text();
        console.error(`[LLM] Raw response: "${content?.slice(0, 300)}"`);

        if (!content) throw new Error("Empty response from Gemini");
        response = JSON.parse(content);
        console.error(`[LLM] Action: ${response.action}`);

    } catch (llmError) {
        console.error("[LLM ERROR]:", llmError.message);
        await sendTelegram(chat_id, "😵‍💫 Erro na IA. Tente novamente em instantes.");
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
        return Response.json({ status: "llm_error", error: llmError.message });
    }

    // Execute action
    let finalReply = response.reply_text || "Ok.";
    const action = response.action;
    let cid = resolveCompanyId(response.target_company_id);

    if (response.target_company_id && response.target_company_id !== currentCompanyId) {
        const newCompany = companies.find(c => c.id === response.target_company_id);
        if (newCompany) {
            await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: newCompany.id });
            currentCompanyId = newCompany.id;
            cid = newCompany.id;
        }
    }

    const needsCompany = ["search_products", "create_sale", "create_client", "add_expense", "pay_bill", "search_finance", "generate_chart"].includes(action);

    if (needsCompany && !cid) {
        finalReply = `🏢 *Qual filial?*\nOpções: ${companies.map(c => c.name).join(", ")}`;
    } else {
        try {
            if (action === "add_expense") {
                const eData = response.expense_data;
                const account = accounts.find(a => a.id === eData.account_id)
                    || accounts.find(a => a.company_id === cid && a.type === 'caixa')
                    || accounts.find(a => a.company_id === cid);

                await base44.asServiceRole.entities.Transaction.create({
                    description: eData.description || "Lançamento via Bot",
                    amount: Number(eData.amount),
                    original_amount: Number(eData.amount),
                    type: eData.type || "despesa",
                    category: eData.category || "Geral",
                    status: eData.is_paid ? "pago" : "pendente",
                    paid_amount: eData.is_paid ? Number(eData.amount) : 0,
                    due_date: new Date().toISOString().split('T')[0],
                    payment_date: eData.is_paid ? new Date().toISOString().split('T')[0] : null,
                    account_id: account?.id || null,
                    company_id: cid,
                    notes: "Lançado via TelegramBot"
                });

                finalReply = `💸 *${eData.type === 'receita' ? 'Receita' : 'Despesa'} Lançada!*\n📝 ${eData.description}\n💲 R$ ${Number(eData.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n📅 ${eData.is_paid ? '✅ Pago' : '🟡 Pendente'}`;
            }

            else if (action === "pay_bill") {
                const pData = response.payment_data;
                const pending = await base44.asServiceRole.entities.Transaction.filter({
                    company_id: cid,
                    status: { $in: ['pendente', 'atrasado', 'parcial'] },
                    description: { $regex: pData.search_term || "", $options: 'i' }
                });

                const match = pending.find(t => {
                    if (!pData.amount_approx) return true;
                    return Math.abs(t.amount - pData.amount_approx) < (t.amount * 0.15);
                });

                if (match) {
                    await base44.asServiceRole.entities.Transaction.update(match.id, {
                        status: 'pago',
                        paid_amount: match.amount,
                        payment_date: new Date().toISOString().split('T')[0],
                        notes: (match.notes || "") + "\nBaixa via TelegramBot"
                    });
                    finalReply = `✅ *Conta Paga!*\n${match.description} — R$ ${match.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                } else {
                    finalReply = `⚠️ Não encontrei conta pendente parecida com "${pData.search_term}".`;
                }
            }

            else if (action === "search_finance") {
                const fQuery = response.finance_query;
                const isOpen = ['aberto', 'pendente', 'atrasado'].includes(fQuery.status);

                const filter = { company_id: cid };
                if (fQuery.type && fQuery.type !== 'all') filter.type = fQuery.type;
                if (fQuery.category_contains) filter.category = { $regex: fQuery.category_contains, $options: 'i' };
                if (fQuery.status && fQuery.status !== 'all') {
                    filter.status = fQuery.status === 'aberto'
                        ? { $in: ['pendente', 'atrasado', 'parcial'] }
                        : fQuery.status;
                }
                if (fQuery.start_date || fQuery.end_date) {
                    filter.due_date = {};
                    if (fQuery.start_date) filter.due_date.$gte = fQuery.start_date;
                    if (fQuery.end_date) filter.due_date.$lte = fQuery.end_date;
                }

                const txs = await base44.asServiceRole.entities.Transaction.filter(filter, isOpen ? 'due_date' : '-due_date', 20);
                const total = txs.reduce((s, t) => s + t.amount, 0);

                if (txs.length > 0) {
                    const statusMap = { pago: '✅', pendente: '🟡', atrasado: '🔴', parcial: '🟠' };
                    const lines = txs.map(t => {
                        const d = (t.due_date || '').split('-').reverse().slice(0, 2).join('/');
                        return `${t.status === 'atrasado' ? '🚨' : '▪️'} *${t.description}*\n   └ R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | ${statusMap[t.status] || ''} ${t.status} | ${d}`;
                    });
                    finalReply = `📊 *Resultado*\n\n${lines.join("\n")}\n\n*Total: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
                } else {
                    finalReply = `🔍 Nenhuma transação encontrada com esses critérios.`;
                }
            }

            else if (action === "generate_chart") {
                const cData = response.chart_data;
                const chartConfig = {
                    type: cData.type,
                    data: {
                        labels: cData.labels,
                        datasets: cData.datasets.map((ds, i) => ({
                            label: ds.label,
                            data: ds.data,
                            backgroundColor: i === 0 ? 'rgba(54,162,235,0.5)' : 'rgba(255,99,132,0.5)',
                            borderColor: i === 0 ? 'rgba(54,162,235,1)' : 'rgba(255,99,132,1)',
                            borderWidth: 1
                        }))
                    },
                    options: { title: { display: true, text: cData.title } }
                };
                const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=500&height=300&backgroundColor=white`;
                await sendPhoto(chat_id, url, response.reply_text || "📊 Gráfico gerado.");
                finalReply = response.reply_text || "Gráfico enviado 👆";
            }

            else if (action === "create_client") {
                const cData = response.client_data;
                cData.company_id = cid;
                cData.type = "cliente";
                const existing = (await base44.asServiceRole.entities.Contact.filter({
                    name: { $regex: cData.name, $options: 'i' }, company_id: cid
                }))[0];
                if (existing) {
                    finalReply = `⚠️ *Cliente já existe:* ${existing.name} (Tel: ${existing.phone || 'N/A'})`;
                } else {
                    const nc = await base44.asServiceRole.entities.Contact.create(cData);
                    finalReply = `✅ *Cliente Cadastrado!*\n👤 ${nc.name}\n📞 ${nc.phone || 'Sem telefone'}`;
                }
            }

            else if (action === "search_products") {
                const products = await base44.asServiceRole.entities.Product.filter({
                    name: { $regex: response.search_query || "", $options: 'i' },
                    company_id: cid, is_active: true
                }, '-name', 10);
                finalReply = products.length
                    ? `📦 *Produtos:*\n` + products.map(p => `▫️ ${p.name} | R$ ${(p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Est: ${p.current_stock}`).join("\n")
                    : `Nenhum produto encontrado.`;
            }

            else if (action === "create_sale") {
                const { client_name, items, payment_method } = response.sale_data;
                const client = (await base44.asServiceRole.entities.Contact.filter({
                    name: { $regex: client_name, $options: 'i' }, company_id: cid
                }))[0];
                if (!client) throw new Error(`Cliente "${client_name}" não encontrado.`);

                let saleItems = [];
                let total = 0;
                for (const item of items) {
                    const product = (await base44.asServiceRole.entities.Product.filter({
                        name: { $regex: item.product_name, $options: 'i' }, company_id: cid
                    }))[0];
                    if (!product) throw new Error(`Produto "${item.product_name}" não encontrado.`);
                    const itemTotal = product.sale_price * item.quantity;
                    total += itemTotal;
                    saleItems.push({ product_id: product.id, product_name: product.name, quantity: item.quantity, unit: product.unit, unit_price: product.sale_price, total: itemTotal, quantity_withdrawn: 0 });
                }

                const sale = await base44.asServiceRole.entities.Sale.create({
                    reference: `VEN-${Date.now().toString().slice(-6)}`,
                    company_id: cid, client_id: client.id, client_name: client.name,
                    seller_name: "TelegramBot", sale_date: new Date().toISOString().split('T')[0],
                    items: saleItems, subtotal: total, total,
                    payment_method: payment_method || "dinheiro",
                    status: "concluida", payment_status: "pendente", withdrawal_status: "aguardando"
                });
                finalReply = `✅ *Venda Realizada!* (${sale.reference})\n👤 ${client.name}\n💰 R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            }

        } catch (logicError) {
            console.error("[LOGIC ERROR]:", logicError.message);
            finalReply = `⚠️ *Erro:* ${logicError.message}`;
        }
    }

    // Save history & cleanup
    history.push({ role: "user", content: user_text });
    history.push({ role: "assistant", content: finalReply });

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {})
    ]);

    return Response.json({ status: "success", action });
});