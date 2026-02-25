// processTelegramQueue v7 - prompts refinados
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';
import { GoogleGenAI } from 'npm:@google/genai@1.0.1';

const MODEL_NAME = "gemini-2.5-flash";

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    console.error(`[v5] INIT model=${MODEL_NAME} | BOT=${BOT_TOKEN ? 'OK' : 'MISSING'} | GEMINI=${GEMINI_API_KEY ? 'OK' : 'MISSING'}`);

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

    // ── Parse payload ─────────────────────────────────────────────────────────
    let payload;
    try { payload = await req.json(); }
    catch (e) { return Response.json({ error: "invalid_json" }, { status: 400 }); }

    const queueItem = payload.data;
    if (!queueItem || !queueItem.user_text) return Response.json({ status: "ignored" });

    let { chat_id, user_text, id: queueId, media_type, voice_file_id, photo_file_id } = queueItem;
    chat_id = String(chat_id);
    console.error(`[v5] MSG chat=${chat_id} type=${media_type} text="${user_text?.slice(0, 60)}"`);

    // ── Multimedia processing ─────────────────────────────────────────────────
    if ((media_type === "voice" && voice_file_id) || (media_type === "photo" && photo_file_id)) {
        if (!GEMINI_API_KEY) {
            await sendTelegram(chat_id, "⚠️ GEMINI_API_KEY não configurada.");
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: "missing_gemini_key" });
        }

        const isVoice = media_type === "voice";
        await sendAction(chat_id, isVoice ? "record_voice" : "upload_photo");

        try {
            // 1. Pegar caminho do arquivo no Telegram
            const fileId = isVoice ? voice_file_id : photo_file_id;
            console.error(`[MEDIA] getFile fileId=${fileId}`);
            const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            if (!fileData.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(fileData)}`);
            console.error(`[MEDIA] file_path=${fileData.result.file_path}`);

            // 2. Baixar arquivo
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
            const dlRes = await fetch(fileUrl);
            if (!dlRes.ok) throw new Error(`Download failed HTTP ${dlRes.status}`);
            const arrayBuffer = await dlRes.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            console.error(`[MEDIA] Downloaded ${bytes.byteLength} bytes`);

            // 3. Base64 puro (sem Node Buffer)
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const base64Data = btoa(binary);
            console.error(`[MEDIA] base64 length=${base64Data.length}`);

            // 4. Chamar Gemini com multimodal
            // Telegram voice = OGG+OPUS, Gemini aceita "audio/ogg" ou "audio/webm"
            // Para imagens: detectar pelo file_path
            let mimeType;
            if (isVoice) {
                mimeType = "audio/ogg";
            } else {
                const fp = fileData.result.file_path || "";
                if (fp.endsWith(".jpg") || fp.endsWith(".jpeg")) mimeType = "image/jpeg";
                else if (fp.endsWith(".png")) mimeType = "image/png";
                else if (fp.endsWith(".webp")) mimeType = "image/webp";
                else mimeType = "image/jpeg";
            }
            const prompt = isVoice
                ? `Você é um assistente financeiro especializado. Transcreva este áudio de voz em português brasileiro com precisão máxima.
REGRAS:
- Responda SOMENTE com o texto transcrito, sem introduções, sem prefixos como "O usuário disse:" ou "Transcrição:".
- Mantenha números, valores monetários (R$), datas e nomes exatamente como falados.
- Se houver ruído mas for possível entender parcialmente, transcreva o que entendeu.
- Se completamente inaudível, responda exatamente: [Áudio inaudível]`
                : `Você é um especialista em análise de documentos financeiros. Analise esta imagem com atenção.

Se for COMPROVANTE, NOTA FISCAL, BOLETO, PIX ou RECIBO, extraia estruturadamente:
- 💰 Valor: R$ [valor exato]
- 📅 Data: [data no formato DD/MM/AAAA]
- 🏢 Emitente/Fornecedor: [nome]
- 📋 Descrição: [o que é cobrado]
- 🔢 Número do documento: [se visível]
- 💳 Forma de pagamento: [se identificável]

Se for outro tipo de imagem (produto, local, pessoa, etc.), descreva o que vê em no máximo 2 linhas com foco em relevância financeira ou operacional.

Seja objetivo e preciso. Não invente dados que não estejam visíveis na imagem.`;

            console.error(`[MEDIA] Enviando mimeType=${mimeType} size=${bytes.byteLength} para Gemini ${MODEL_NAME}...`);
            const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            const result = await genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [{ parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }] }]
            });
            console.error(`[MEDIA] Gemini raw result keys: ${Object.keys(result || {}).join(',')}`);
            let processedText = result.text;
            console.error(`[MEDIA] Resposta Gemini (1ª tentativa): "${processedText?.slice(0, 200)}"`);

            // Se vazio/erro em voz, tentar com audio/webm (Opus embutido em WebM)
            if (!processedText && isVoice) {
                console.error(`[MEDIA] Tentando com audio/webm...`);
                const result2 = await genAI.models.generateContent({
                    model: MODEL_NAME,
                    contents: [{ parts: [{ inlineData: { mimeType: "audio/webm", data: base64Data } }, { text: prompt }] }]
                });
                processedText = result2.text;
                console.error(`[MEDIA] Resposta Gemini (2ª tentativa audio/webm): "${processedText?.slice(0, 200)}"`);
            }
            if (!processedText) throw new Error("Gemini retornou resposta vazia para o áudio. O arquivo pode estar corrompido ou o formato não é suportado.");

            // 5. Atualizar user_text para o LLM principal
            if (isVoice) {
                user_text = processedText;
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
            } else {
                const cap = user_text && user_text !== "[Photo Message]" ? `Legenda: ${user_text}\n` : "";
                user_text = `${cap}[Análise da Imagem]: ${processedText}`;
                await sendTelegram(chat_id, `📷 *Analisei a imagem:*\n${processedText}`);
            }

        } catch (mediaError) {
            console.error("[MEDIA ERROR]:", mediaError.message, mediaError.stack);
            await sendTelegram(chat_id, `😓 Não consegui processar o ${isVoice ? "áudio" : "imagem"}.\nErro: ${mediaError.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: "media_error", error: mediaError.message });
        }
    }

    // ── Main LLM (agente financeiro) ─────────────────────────────────────────
    sendAction(chat_id, "typing");

    let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }))[0];
    if (!session) {
        session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });
    }
    let history = (session.history || []).slice(-10);

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

    const systemPrompt = `Você é o AGENTE FINANCEIRO EXECUTIVO de uma empresa agroindustrial. Data de hoje: ${todayStr}.

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
2. Ao receber transcrição de áudio (começa com texto normal), processe como pedido normal.
3. Ao receber análise de imagem (começa com "[Análise da Imagem]"), extraia os dados e pergunte ao usuário se deseja lançar como despesa/receita antes de criar.
4. Nos relatórios financeiros, sempre mostre: saldo, total a pagar, total a receber, e destaque contas atrasadas.
5. Ao listar transações, ordene por urgência: atrasadas primeiro, depois por vencimento.
6. Seja direto e objetivo. Use emojis para facilitar leitura rápida no celular.
7. Valores monetários sempre no formato R$ X.XXX,XX (padrão brasileiro).
8. Ao lançar despesa de comprovante, confirme com o usuário os dados extraídos antes de salvar.
9. Para áudios transcritos, interprete o contexto: "paguei X para Y" = add_expense com is_paid:true; "preciso pagar X" = add_expense com is_paid:false; "quanto devo?" = search_finance.
10. Se a pergunta for sobre relatório geral, use search_finance para buscar dados e depois formate uma resposta completa.

AÇÕES DISPONÍVEIS (responda SEMPRE em JSON puro, sem blocos de código):
- "reply": informar, conversar, confirmar, solicitar dados
- "set_company": trocar filial ativa
- "add_expense": lançar nova transação (despesa OU receita)
- "pay_bill": dar baixa em conta pendente existente
- "search_finance": buscar e listar transações com filtros
- "generate_chart": gerar gráfico visual
- "create_client": cadastrar novo cliente/fornecedor
- "create_sale": registrar nova venda
- "search_products": buscar produtos no estoque

ESTRUTURA JSON OBRIGATÓRIA (todos os campos sempre presentes):
{
  "action": "reply|set_company|add_expense|pay_bill|search_finance|generate_chart|create_client|create_sale|search_products",
  "reply_text": "Mensagem em Markdown para o usuário. Use *negrito*, _itálico_, listas com •. Seja claro e conciso.",
  "target_company_id": null,
  "expense_data": {
    "description": "Descrição clara da transação",
    "amount": 0,
    "type": "despesa",
    "category": "Categoria (ex: Combustível, Manutenção, Salários, Fornecedores, Vendas, Outros)",
    "account_id": "",
    "is_paid": false,
    "due_date": null
  },
  "payment_data": {"search_term": "", "amount_approx": 0},
  "finance_query": {"type": "all", "status": "all", "category_contains": null, "start_date": null, "end_date": null},
  "chart_data": {"type": "bar", "title": "", "labels": [], "datasets": []},
  "client_data": {},
  "sale_data": {},
  "search_query": ""
}`;

    // Chamar Gemini LLM
    let response;
    try {
        const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        console.error(`[LLM] Chamando Gemini ${MODEL_NAME}. history=${history.length}`);

        const historyMessages = [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: '{"action":"reply","reply_text":"Pronto. Sou o Agente Financeiro Executivo.","target_company_id":null}' }] },
            ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
            { role: "user", parts: [{ text: user_text }] }
        ];

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: historyMessages,
            config: { responseMimeType: "application/json" }
        });
        const content = result.text;
        console.error(`[LLM] Resposta raw: "${content?.slice(0, 300)}"`);
        if (!content) throw new Error("Gemini resposta vazia");
        response = JSON.parse(content);
        console.error(`[LLM] action=${response.action}`);

    } catch (llmError) {
        console.error("[LLM ERROR]:", llmError.message);
        await sendTelegram(chat_id, "😵‍💫 Erro na IA. Tente novamente.");
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
        return Response.json({ status: "llm_error", error: llmError.message });
    }

    // Executar ação
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
                const ed = response.expense_data;
                const acct = accounts.find(a => a.id === ed.account_id) || accounts.find(a => a.company_id === cid && a.type === 'caixa') || accounts.find(a => a.company_id === cid);
                await base44.asServiceRole.entities.Transaction.create({
                    description: ed.description || "Lançamento via Bot",
                    amount: Number(ed.amount), original_amount: Number(ed.amount),
                    type: ed.type || "despesa", category: ed.category || "Geral",
                    status: ed.is_paid ? "pago" : "pendente",
                    paid_amount: ed.is_paid ? Number(ed.amount) : 0,
                    due_date: new Date().toISOString().split('T')[0],
                    payment_date: ed.is_paid ? new Date().toISOString().split('T')[0] : null,
                    account_id: acct?.id || null, company_id: cid, notes: "Via TelegramBot"
                });
                finalReply = `💸 *${ed.type === 'receita' ? 'Receita' : 'Despesa'} Lançada!*\n📝 ${ed.description}\n💲 R$ ${Number(ed.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n📅 ${ed.is_paid ? '✅ Pago' : '🟡 Pendente'}`;
            }
            else if (action === "pay_bill") {
                const pd = response.payment_data;
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
                const fq = response.finance_query;
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
                const cd = response.chart_data;
                const cfg = { type: cd.type, data: { labels: cd.labels, datasets: cd.datasets.map((ds, i) => ({ label: ds.label, data: ds.data, backgroundColor: i === 0 ? 'rgba(54,162,235,0.5)' : 'rgba(255,99,132,0.5)', borderColor: i === 0 ? 'rgba(54,162,235,1)' : 'rgba(255,99,132,1)', borderWidth: 1 })) }, options: { title: { display: true, text: cd.title } } };
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
                const { client_name, items, payment_method } = response.sale_data;
                const client = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: client_name, $options: 'i' }, company_id: cid }))[0];
                if (!client) throw new Error(`Cliente "${client_name}" não encontrado.`);
                let saleItems = [], total = 0;
                for (const item of items) {
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

    // Salvar histórico e cleanup
    history.push({ role: "user", content: user_text });
    history.push({ role: "assistant", content: finalReply });

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {})
    ]);

    return Response.json({ status: "success", action });
});