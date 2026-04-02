// processTelegramQueue v8 - usando Base44 InvokeLLM (sem Gemini direto)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

    console.log(`[v8] INIT | BOT=${BOT_TOKEN ? 'OK' : 'MISSING'}`);

    if (!BOT_TOKEN) return Response.json({ error: "No BOT_TOKEN" }, { status: 500 });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const sendTelegram = async (chatId, text) => {
        try {
            const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
            });
            const j = await r.json();
            if (!j.ok) console.error(`[SEND] Err: ${JSON.stringify(j)}`);
        } catch (e) { console.error("[SEND] Exc:", e.message); }
    };

    const sendAction = async (chatId, action = "typing") => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action })
            });
        } catch (e) { console.error("[ACTION] Exc:", e.message); }
    };

    const sendPhoto = async (chatId, photoUrl, caption) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
            });
        } catch (e) { console.error("[PHOTO] Exc:", e.message); }
    };

    // Baixa arquivo do Telegram e faz upload para o Base44, retorna URL pública
    const uploadTelegramFile = async (fileId) => {
        const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        if (!fileData.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(fileData)}`);

        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
        const dlRes = await fetch(fileUrl);
        if (!dlRes.ok) throw new Error(`Download failed HTTP ${dlRes.status}`);

        const arrayBuffer = await dlRes.arrayBuffer();
        const blob = new Blob([arrayBuffer]);
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
        console.log(`[MEDIA] Uploaded to Base44: ${file_url}`);
        return file_url;
    };

    // ── Parse payload ─────────────────────────────────────────────────────────
    let payload;
    try { payload = await req.json(); }
    catch (e) { return Response.json({ error: "invalid_json" }, { status: 400 }); }

    const queueItem = payload.data;
    if (!queueItem || !queueItem.user_text) return Response.json({ status: "ignored" });

    let { chat_id, user_text, id: queueId, media_type, voice_file_id, photo_file_id } = queueItem;
    chat_id = String(chat_id);
    console.log(`[v8] MSG chat=${chat_id} type=${media_type} text="${user_text?.slice(0, 60)}"`);

    // ── Multimedia processing via Base44 InvokeLLM ────────────────────────────
    if ((media_type === "voice" && voice_file_id) || (media_type === "photo" && photo_file_id)) {
        const isVoice = media_type === "voice";
        await sendAction(chat_id, isVoice ? "record_voice" : "upload_photo");

        try {
            const fileId = isVoice ? voice_file_id : photo_file_id;
            const uploadedUrl = await uploadTelegramFile(fileId);

            const prompt = isVoice
                ? `Transcreva este áudio de voz em português brasileiro com precisão máxima. Responda SOMENTE com o texto transcrito, sem introduções ou prefixos. Mantenha números, valores monetários (R$), datas e nomes exatamente como falados. Se completamente inaudível, responda: [Áudio inaudível]`
                : `Analise esta imagem. Se for comprovante, nota fiscal, boleto, PIX ou recibo, extraia: Valor, Data, Emitente/Fornecedor, Descrição, Número do documento, Forma de pagamento. Se for outro tipo de imagem, descreva brevemente com foco em relevância financeira. Seja objetivo e preciso.`;

            const processedText = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt,
                file_urls: [uploadedUrl]
            });

            if (isVoice) {
                user_text = processedText;
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
            } else {
                const cap = user_text && user_text !== "[Photo Message]" ? `Legenda: ${user_text}\n` : "";
                user_text = `${cap}[Análise da Imagem]: ${processedText}`;
                await sendTelegram(chat_id, `📷 *Analisei a imagem:*\n${processedText}`);
            }

        } catch (mediaError) {
            console.error("[MEDIA ERROR]:", mediaError.message);
            await sendTelegram(chat_id, `😓 Não consegui processar o ${isVoice ? "áudio" : "imagem"}.\nErro: ${mediaError.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: "media_error", error: mediaError.message });
        }
    }

    // ── Main LLM via Base44 InvokeLLM ─────────────────────────────────────────
    sendAction(chat_id, "typing");

    let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }))[0];
    if (!session) {
        session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });
    }
    let history = (session.history || []).slice(-20);

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

    // Contexto financeiro
    let financialContext = "Selecione uma filial para ver os dados.";
    if (currentCompanyId) {
        const [pp, pl, rp, rl] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'despesa', status: 'atrasado' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: currentCompanyId, type: 'receita', status: 'atrasado' })
        ]);
        const spp = pp.reduce((s, t) => s + t.amount, 0);
        const spl = pl.reduce((s, t) => s + t.amount, 0);
        const srp = rp.reduce((s, t) => s + t.amount, 0);
        const srl = rl.reduce((s, t) => s + t.amount, 0);
        const topLate = pl.sort((a, b) => b.amount - a.amount).slice(0, 5);
        const topPend = pp.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5);
        const compAccounts = accounts.filter(a => a.company_id === currentCompanyId);
        const totalBal = compAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);
        const fmt = t => `- ${t.description} | ${t.contact_name || 'Sem contato'} | R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Venc: ${(t.due_date || '').split('-').reverse().join('/')}`;
        financialContext = `
💰 SALDO: R$ ${totalBal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
🔴 A PAGAR: Atrasado R$ ${spl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pl.length}) | A vencer R$ ${spp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pp.length})
🟢 A RECEBER: Atrasado R$ ${srl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | A vencer R$ ${srp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
⚠️ TOP ATRASADAS: ${topLate.length ? topLate.map(fmt).join("\n") : "(Nenhum)"}
📅 PRÓXIMAS: ${topPend.length ? topPend.map(fmt).join("\n") : "(Nenhuma)"}`;
    }

    const todayStr = new Date().toLocaleDateString('pt-BR');
    const companyAccountsStr = accounts.filter(a => a.company_id === currentCompanyId)
        .map(a => `  • ${a.name} (ID: ${a.id}, Tipo: ${a.type}, Saldo: R$ ${(a.current_balance||0).toLocaleString('pt-BR',{minimumFractionDigits:2})})`).join("\n") || "  (Nenhuma conta cadastrada)";

    // Montar histórico como texto para o prompt
    const historyText = history.length > 0
        ? "\n\nHISTÓRICO DA CONVERSA:\n" + history.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join("\n")
        : "";

    const fullPrompt = `Você é o AGENTE FINANCEIRO EXECUTIVO de uma empresa agroindustrial. Data de hoje: ${todayStr}.

═══════════════════════════════
FILIAIS DISPONÍVEIS:
${companies.map(c => `  • ${c.name} (ID: ${c.id})`).join("\n")}

FILIAL ATIVA: ${currentCompanyName} (ID: ${currentCompanyId || 'null'})

CONTAS DA FILIAL ATIVA:
${companyAccountsStr}

SITUAÇÃO FINANCEIRA ATUAL:
${financialContext}
═══════════════════════════════

REGRAS DE COMPORTAMENTO:
1. Toda operação financeira EXIGE filial selecionada. Se não houver, pergunte antes de qualquer ação.
2. Ao receber transcrição de áudio (texto normal), processe como pedido normal.
3. Ao receber análise de imagem (começa com "[Análise da Imagem]"), extraia os dados e pergunte ao usuário se deseja lançar como despesa/receita antes de criar.
4. Nos relatórios financeiros, sempre mostre: saldo, total a pagar, total a receber, e destaque contas atrasadas.
5. Ao listar transações, ordene por urgência: atrasadas primeiro, depois por vencimento.
6. Seja direto e objetivo. Use emojis para facilitar leitura rápida no celular.
7. Valores monetários sempre no formato R$ X.XXX,XX (padrão brasileiro).
8. Ao lançar despesa de comprovante, confirme com o usuário os dados extraídos antes de salvar.
9. Para áudios transcritos: "paguei X para Y" = add_expense com is_paid:true; "preciso pagar X" = add_expense com is_paid:false.
10. Se a pergunta for sobre relatório geral, use search_finance para buscar dados e formate uma resposta completa.${historyText}

MENSAGEM ATUAL DO USUÁRIO: ${user_text}

Responda com a ação correta no formato JSON especificado.`;

    const responseSchema = {
        type: "object",
        properties: {
            action: { type: "string" },
            reply_text: { type: "string" },
            target_company_id: { type: "string" },
            expense_data: {
                type: "object",
                properties: {
                    description: { type: "string" },
                    amount: { type: "number" },
                    type: { type: "string" },
                    category: { type: "string" },
                    account_id: { type: "string" },
                    is_paid: { type: "boolean" },
                    due_date: { type: "string" }
                }
            },
            payment_data: {
                type: "object",
                properties: {
                    search_term: { type: "string" },
                    amount_approx: { type: "number" }
                }
            },
            finance_query: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    status: { type: "string" },
                    category_contains: { type: "string" },
                    start_date: { type: "string" },
                    end_date: { type: "string" }
                }
            },
            chart_data: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    title: { type: "string" },
                    labels: { type: "array", items: { type: "string" } },
                    datasets: { type: "array", items: { type: "object" } }
                }
            },
            client_data: { type: "object" },
            sale_data: { type: "object" },
            search_query: { type: "string" }
        },
        required: ["action", "reply_text"]
    };

    let response;
    const invokeLLM = async () => {
        return await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: fullPrompt,
            response_json_schema: responseSchema
        });
    };

    try {
        console.log(`[LLM] Chamando Base44 InvokeLLM. history=${history.length}`);
        try {
            response = await invokeLLM();
        } catch (firstErr) {
            console.log(`[LLM] Primeira tentativa falhou: ${firstErr.message}. Tentando novamente...`);
            await new Promise(r => setTimeout(r, 2000));
            response = await invokeLLM();
        }
        if (!response || !response.action) throw new Error("Resposta da IA inválida ou vazia");
        console.log(`[LLM] action=${response?.action}`);
    } catch (llmError) {
        console.error("[LLM ERROR]:", llmError.message);
        await sendTelegram(chat_id, "😵‍💫 Erro na IA. Tente novamente.");
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
        return Response.json({ status: "llm_error", error: llmError.message });
    }

    // ── Executar ação ─────────────────────────────────────────────────────────
    let finalReply = response.reply_text || "Ok.";
    const action = response.action;
    let cid = resolveCompanyId(response.target_company_id);

    if (response.target_company_id && response.target_company_id !== currentCompanyId) {
        const nc = companies.find(c => c.id === response.target_company_id);
        if (nc) {
            await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
            currentCompanyId = nc.id; cid = nc.id;
        }
    }

    const needsCompany = ["search_products","create_sale","create_client","add_expense","pay_bill","search_finance","generate_chart"].includes(action);
    if (needsCompany && !cid) {
        finalReply = `🏢 *Qual filial?*\nOpções: ${companies.map(c => c.name).join(", ")}`;
    } else {
        try {
            if (action === "add_expense") {
                const ed = response.expense_data || {};
                const acct = accounts.find(a => a.id === ed.account_id) || accounts.find(a => a.company_id === cid && a.type === 'caixa') || accounts.find(a => a.company_id === cid);
                const today = new Date().toISOString().split('T')[0];
                let dueDate = ed.due_date || today;
                if (dueDate && dueDate.includes('/')) {
                    const parts = dueDate.split('/');
                    if (parts.length === 3) dueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                await base44.asServiceRole.entities.Transaction.create({
                    description: ed.description || "Lançamento via Bot",
                    amount: Number(ed.amount), original_amount: Number(ed.amount),
                    type: ed.type || "despesa", category: ed.category || "Outras Despesas",
                    status: ed.is_paid ? "pago" : "pendente",
                    paid_amount: ed.is_paid ? Number(ed.amount) : 0,
                    due_date: dueDate,
                    payment_date: ed.is_paid ? today : null,
                    account_id: acct?.id || null, company_id: cid, notes: "Via TelegramBot"
                });
                finalReply = `✅ *${ed.type === 'receita' ? 'Receita' : 'Despesa'} Lançada!*\n📝 ${ed.description}\n💲 *R$ ${Number(ed.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n📁 ${ed.category || 'Outras Despesas'}\n📅 Venc: ${dueDate.split('-').reverse().join('/')}\n${ed.is_paid ? '✅ *Pago*' : '🟡 Pendente'}`;
            }
            else if (action === "pay_bill") {
                const pd = response.payment_data || {};
                const pending = await base44.asServiceRole.entities.Transaction.filter({
                    company_id: cid, status: { $in: ['pendente', 'atrasado', 'parcial'] },
                    description: { $regex: pd.search_term || "", $options: 'i' }
                });
                const match = pending.find(t => !pd.amount_approx || Math.abs(t.amount - pd.amount_approx) < (t.amount * 0.15));
                if (match) {
                    await base44.asServiceRole.entities.Transaction.update(match.id, {
                        status: 'pago', paid_amount: match.amount,
                        payment_date: new Date().toISOString().split('T')[0],
                        notes: (match.notes || "") + "\nBaixa via TelegramBot"
                    });
                    finalReply = `✅ *Conta Paga!*\n${match.description} — R$ ${match.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                } else {
                    finalReply = `⚠️ Não encontrei conta pendente com "${pd.search_term}".`;
                }
            }
            else if (action === "search_finance") {
                const fq = response.finance_query || {};
                const isOpen = ['aberto','pendente','atrasado'].includes(fq.status);
                const filter = { company_id: cid };
                if (fq.type && fq.type !== 'all') filter.type = fq.type;
                if (fq.category_contains) filter.category = { $regex: fq.category_contains, $options: 'i' };
                if (fq.status && fq.status !== 'all') filter.status = fq.status === 'aberto' ? { $in: ['pendente', 'atrasado', 'parcial'] } : fq.status;
                if (fq.start_date || fq.end_date) {
                    filter.due_date = {};
                    if (fq.start_date) filter.due_date.$gte = fq.start_date;
                    if (fq.end_date) filter.due_date.$lte = fq.end_date;
                }
                const txs = await base44.asServiceRole.entities.Transaction.filter(filter, isOpen ? 'due_date' : '-due_date', 20);
                const total = txs.reduce((s, t) => s + t.amount, 0);
                if (txs.length > 0) {
                    const sMap = { pago: '✅', pendente: '🟡', atrasado: '🔴', parcial: '🟠' };
                    const lines = txs.map(t => {
                        const d = (t.due_date || '').split('-').reverse().slice(0, 2).join('/');
                        return `${t.status === 'atrasado' ? '🚨' : '▪️'} *${t.description}*\n   └ R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | ${sMap[t.status] || ''} ${t.status} | ${d}`;
                    });
                    finalReply = `📊 *Resultado*\n\n${lines.join("\n")}\n\n*Total: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
                } else {
                    finalReply = `🔍 Nenhuma transação encontrada.`;
                }
            }
            else if (action === "generate_chart") {
                const cd = response.chart_data || {};
                const cfg = { type: cd.type || 'bar', data: { labels: cd.labels || [], datasets: (cd.datasets || []).map((ds, i) => ({ label: ds.label, data: ds.data, backgroundColor: i === 0 ? 'rgba(54,162,235,0.5)' : 'rgba(255,99,132,0.5)', borderColor: i === 0 ? 'rgba(54,162,235,1)' : 'rgba(255,99,132,1)', borderWidth: 1 })) }, options: { title: { display: true, text: cd.title || '' } } };
                await sendPhoto(chat_id, `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=500&height=300&backgroundColor=white`, response.reply_text || "Gráfico");
                finalReply = response.reply_text || "Gráfico enviado 👆";
            }
            else if (action === "create_client") {
                const cd = { ...response.client_data, company_id: cid, type: "cliente" };
                const ex = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: cd.name, $options: 'i' }, company_id: cid }))[0];
                if (ex) { finalReply = `⚠️ *Cliente já existe:* ${ex.name}`; }
                else { const nc = await base44.asServiceRole.entities.Contact.create(cd); finalReply = `✅ *Cadastrado!* ${nc.name}`; }
            }
            else if (action === "search_products") {
                const prods = await base44.asServiceRole.entities.Product.filter({ name: { $regex: response.search_query || "", $options: 'i' }, company_id: cid, is_active: true }, '-name', 10);
                finalReply = prods.length ? `📦 *Produtos:*\n` + prods.map(p => `▫️ ${p.name} | R$ ${(p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Est: ${p.current_stock}`).join("\n") : `Nenhum produto encontrado.`;
            }
            else if (action === "create_sale") {
                const { client_name, items, payment_method } = response.sale_data || {};
                const client = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: client_name, $options: 'i' }, company_id: cid }))[0];
                if (!client) throw new Error(`Cliente "${client_name}" não encontrado.`);
                let saleItems = [], total = 0;
                for (const item of (items || [])) {
                    const prod = (await base44.asServiceRole.entities.Product.filter({ name: { $regex: item.product_name, $options: 'i' }, company_id: cid }))[0];
                    if (!prod) throw new Error(`Produto "${item.product_name}" não encontrado.`);
                    const it = prod.sale_price * item.quantity; total += it;
                    saleItems.push({ product_id: prod.id, product_name: prod.name, quantity: item.quantity, unit: prod.unit, unit_price: prod.sale_price, total: it, quantity_withdrawn: 0 });
                }
                const sale = await base44.asServiceRole.entities.Sale.create({ reference: `VEN-${Date.now().toString().slice(-6)}`, company_id: cid, client_id: client.id, client_name: client.name, seller_name: "TelegramBot", sale_date: new Date().toISOString().split('T')[0], items: saleItems, subtotal: total, total, payment_method: payment_method || "dinheiro", status: "concluida", payment_status: "pendente", withdrawal_status: "aguardando" });
                finalReply = `✅ *Venda!* (${sale.reference})\n👤 ${client.name}\n💰 R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            }
        } catch (logicErr) {
            console.error("[LOGIC ERROR]:", logicErr.message);
            finalReply = `⚠️ *Erro:* ${logicErr.message}`;
        }
    }

    // Salvar histórico (até 20 mensagens = 10 trocas)
    history.push({ role: "user", content: user_text });
    history.push({ role: "assistant", content: finalReply });
    if (history.length > 20) history = history.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {})
    ]);

    return Response.json({ status: "success", action });
});