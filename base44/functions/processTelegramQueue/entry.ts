// processTelegramQueue v10 - fix $in operator
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

// ── Telegram Helpers ──────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
}

async function sendAction(chatId, action = "typing") {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
    }).catch(() => {});
}

async function sendPhoto(chatId, photoUrl, caption) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
    }).catch(() => {});
}

// ── Upload mídia do Telegram → Base44 ────────────────────────────────────────
async function uploadTelegramFile(base44, fileId) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`getFile failed: ${JSON.stringify(data)}`);
    const dl = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`);
    if (!dl.ok) throw new Error(`Download failed HTTP ${dl.status}`);
    const blob = new Blob([await dl.arrayBuffer()]);
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    return file_url;
}

// ── Formatar valor BRL ────────────────────────────────────────────────────────
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => (d || '').split('-').reverse().join('/');

// ── Carregar contexto financeiro de uma ou todas as filiais ───────────────────
async function loadFinancialContext(base44, companies, accounts, companyId) {
    const targets = companyId ? companies.filter(c => c.id === companyId) : companies;
    let ctx = '';
    for (const comp of targets) {
        const [pp, pl, rp, rl] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'atrasado' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'atrasado' }),
        ]);
        const bal = accounts.filter(a => a.company_id === comp.id).reduce((s, a) => s + (a.current_balance || 0), 0);
        const topLate = [...pl].sort((a, b) => b.amount - a.amount).slice(0, 5)
            .map(t => `    • ${t.description} | ${brl(t.amount)} | venc ${fmtDate(t.due_date)}`).join('\n') || '    (nenhuma)';
        const topPend = [...pp].sort((a, b) => (a.due_date||'').localeCompare(b.due_date||'')).slice(0, 3)
            .map(t => `    • ${t.description} | ${brl(t.amount)} | venc ${fmtDate(t.due_date)}`).join('\n') || '    (nenhuma)';
        ctx += `\n--- ${comp.name} (ID: ${comp.id}) ---
  Saldo: ${brl(bal)}
  A Pagar Atrasado: ${brl(pl.reduce((s,t)=>s+t.amount,0))} (${pl.length} contas)
  A Pagar Pendente: ${brl(pp.reduce((s,t)=>s+t.amount,0))} (${pp.length} contas)
  A Receber Atrasado: ${brl(rl.reduce((s,t)=>s+t.amount,0))} (${rl.length} contas)
  A Receber Pendente: ${brl(rp.reduce((s,t)=>s+t.amount,0))} (${rp.length} contas)
  Top Atrasadas:\n${topLate}
  Próximas a vencer:\n${topPend}`;
    }
    return ctx || 'Sem dados.';
}

// ── Resolver filial por nome ──────────────────────────────────────────────────
function resolveCompany(companies, nameOrId) {
    if (!nameOrId) return null;
    return companies.find(c => c.id === nameOrId) ||
           companies.find(c => c.name.toLowerCase().includes(nameOrId.toLowerCase())) ||
           null;
}

// ── Executar ações ────────────────────────────────────────────────────────────
async function executeAction(base44, action, response, companies, accounts, session, chatId) {
    const cid = resolveCompany(companies, response.target_company)?.id ||
                session.selected_company_id;

    // Atualizar filial na sessão se mudou
    if (response.target_company && resolveCompany(companies, response.target_company)?.id !== session.selected_company_id) {
        const nc = resolveCompany(companies, response.target_company);
        if (nc) {
            await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
            session.selected_company_id = nc.id;
        }
    }

    if (action === 'add_transaction') {
        const d = response.transaction || {};
        if (!cid) return '⚠️ Informe a filial para registrar o lançamento.';
        const today = new Date().toISOString().split('T')[0];
        let due = d.due_date || today;
        if (due.includes('/')) { const p = due.split('/'); due = `${p[2]}-${p[1]}-${p[0]}`; }
        const acct = accounts.find(a => a.id === d.account_id) ||
                     accounts.find(a => a.company_id === cid && a.type === 'caixa') ||
                     accounts.find(a => a.company_id === cid);
        await base44.asServiceRole.entities.Transaction.create({
            description: d.description || 'Lançamento via Bot',
            amount: Number(d.amount), original_amount: Number(d.amount),
            type: d.type || 'despesa',
            category: d.category || (d.type === 'receita' ? 'Outras Receitas' : 'Outras Despesas'),
            status: d.is_paid ? 'pago' : 'pendente',
            paid_amount: d.is_paid ? Number(d.amount) : 0,
            due_date: due, payment_date: d.is_paid ? today : null,
            account_id: acct?.id || null, company_id: cid, notes: 'Via TelegramBot'
        });
        return `✅ *${d.type === 'receita' ? 'Receita' : 'Despesa'} lançada!*\n📝 ${d.description}\n💰 ${brl(d.amount)}\n📁 ${d.category || 'Outras'}\n📅 Venc: ${fmtDate(due)}\n${d.is_paid ? '✅ Pago' : '🟡 Pendente'}`;
    }

    if (action === 'pay_bill') {
        const pd = response.payment || {};
        if (!cid) return '⚠️ Informe a filial.';
        const [pend1, pend2, pend3] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter({ company_id: cid, status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: cid, status: 'atrasado' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: cid, status: 'parcial' }),
        ]);
        const pending = [...pend1, ...pend2, ...pend3];
        const term = (pd.search_term || '').toLowerCase();
        const match = pending.find(t => {
            const nameMatch = !term || t.description.toLowerCase().includes(term);
            const amtMatch = !pd.amount || Math.abs(t.amount - pd.amount) < t.amount * 0.2;
            return nameMatch && amtMatch;
        });
        if (!match) return `⚠️ Conta não encontrada: "${pd.search_term || ''}"`;
        await base44.asServiceRole.entities.Transaction.update(match.id, {
            status: 'pago', paid_amount: match.amount,
            payment_date: new Date().toISOString().split('T')[0],
            notes: (match.notes || '') + '\nBaixa via TelegramBot'
        });
        return `✅ *Baixa realizada!*\n${match.description} — ${brl(match.amount)}`;
    }

    if (action === 'search_transactions') {
        const q = response.query || {};
        console.log('[SEARCH] query from LLM:', JSON.stringify(q));
        console.log('[SEARCH] target_company from LLM:', response.target_company);

        // Resolver filial pelo nome
        const companyHint = q.company_name || response.target_company || null;
        const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
        const searchCid = targetComp?.id || cid || null;
        console.log('[SEARCH] companyHint:', companyHint, '→ resolved:', targetComp?.name, '| searchCid:', searchCid);

        const baseFilter = {};
        if (searchCid) baseFilter.company_id = searchCid;
        if (q.type && q.type !== 'all') baseFilter.type = q.type;

        // Filtro por data de pagamento (lançamentos/fluxo de caixa)
        if (q.payment_date) baseFilter.payment_date = q.payment_date;

        console.log('[SEARCH] baseFilter:', JSON.stringify(baseFilter), 'status:', q.status);

        let txs = [];
        if (!q.status || q.status === 'all') {
            txs = await base44.asServiceRole.entities.Transaction.filter(baseFilter, '-payment_date', 50);
        } else if (q.status === 'aberto') {
            const [pend, atras, parc] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'pendente' }, 'due_date', 25),
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'atrasado' }, 'due_date', 25),
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'parcial' }, 'due_date', 25),
            ]);
            txs = [...pend, ...atras, ...parc].sort((a, b) => (a.due_date||'').localeCompare(b.due_date||''));
        } else {
            txs = await base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: q.status }, q.status === 'pago' ? '-payment_date' : 'due_date', 50);
        }
        console.log('[SEARCH] txs found:', txs.length);
        if (!txs.length) return `🔍 Nenhuma transação encontrada${targetComp ? ` em ${targetComp.name}` : ''}.`;

        const sIcon = { pago: '✅', pendente: '🟡', atrasado: '🔴', parcial: '🟠' };
        const lines = txs.map(t => {
            const comp = companies.find(c => c.id === t.company_id);
            const dateLabel = t.status === 'pago' ? fmtDate(t.payment_date) : fmtDate(t.due_date);
            const datePrefix = t.status === 'pago' ? 'pg' : 'venc';
            return `${sIcon[t.status] || '▪️'} *${t.description}*${comp && !searchCid ? ` [${comp.name}]` : ''}\n   └ ${brl(t.amount)} | ${t.type === 'receita' ? '📥' : '📤'} ${t.type} | ${datePrefix} ${dateLabel}`;
        });
        const total = txs.reduce((s, t) => s + t.amount, 0);
        const header = targetComp ? `📊 *${targetComp.name}* — ${txs.length} lançamentos` : `📊 *${txs.length} transações encontradas*`;
        return `${header}\n\n${lines.join('\n')}\n\n*Total: ${brl(total)}*`;
    }

    if (action === 'create_contact') {
        if (!cid) return '⚠️ Informe a filial.';
        const cd = { ...response.contact, company_id: cid, type: response.contact?.type || 'cliente' };
        const ex = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: cd.name, $options: 'i' }, company_id: cid }))[0];
        if (ex) return `⚠️ *Contato já existe:* ${ex.name}`;
        const nc = await base44.asServiceRole.entities.Contact.create(cd);
        return `✅ *Cadastrado!* ${nc.name}`;
    }

    if (action === 'search_products') {
        const searchCid = cid || null;
        const filter = { is_active: true };
        if (searchCid) filter.company_id = searchCid;
        if (response.search_term) filter.name = { $regex: response.search_term, $options: 'i' };
        const prods = await base44.asServiceRole.entities.Product.filter(filter, '-name', 10);
        if (!prods.length) return '📦 Nenhum produto encontrado.';
        return `📦 *Produtos:*\n` + prods.map(p => `▫️ ${p.name} | ${brl(p.sale_price)} | Est: ${p.current_stock}`).join('\n');
    }

    if (action === 'generate_chart') {
        const cd = response.chart || {};
        const cfg = {
            type: cd.type || 'bar',
            data: {
                labels: cd.labels || [],
                datasets: (cd.datasets || []).map((ds, i) => ({
                    label: ds.label, data: ds.data,
                    backgroundColor: i === 0 ? 'rgba(54,162,235,0.5)' : 'rgba(255,99,132,0.5)',
                    borderColor: i === 0 ? 'rgba(54,162,235,1)' : 'rgba(255,99,132,1)',
                    borderWidth: 1
                }))
            },
            options: { plugins: { title: { display: !!cd.title, text: cd.title || '' } } }
        };
        await sendPhoto(chatId, `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=500&height=300&backgroundColor=white`, cd.title || 'Gráfico');
        return response.reply || 'Gráfico enviado 👆';
    }

    return null; // usa reply_text padrão
}

// ── Handler Principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (!BOT_TOKEN) return Response.json({ error: 'No BOT_TOKEN' }, { status: 500 });

    const base44 = createClientFromRequest(req);

    let payload;
    try { payload = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }

    const item = payload.data;
    if (!item?.user_text) return Response.json({ status: 'ignored' });

    let { chat_id, user_text, id: queueId, media_type, voice_file_id, photo_file_id } = item;
    chat_id = String(chat_id);

    console.log(`[v10] chat=${chat_id} type=${media_type} text="${user_text?.slice(0, 80)}"`);

    // ── Processar mídia ───────────────────────────────────────────────────────
    if ((media_type === 'voice' && voice_file_id) || (media_type === 'photo' && photo_file_id)) {
        const isVoice = media_type === 'voice';
        await sendAction(chat_id, isVoice ? 'record_voice' : 'upload_photo');
        try {
            const fileId = isVoice ? voice_file_id : photo_file_id;
            const url = await uploadTelegramFile(base44, fileId);
            const prompt = isVoice
                ? 'Transcreva este áudio em português brasileiro. Responda APENAS com o texto transcrito.'
                : 'Analise esta imagem. Se for comprovante/nota fiscal, extraia: valor, data, fornecedor, descrição. Seja objetivo.';
            const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, file_urls: [url] });
            if (isVoice) {
                user_text = result;
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
            } else {
                const cap = user_text && user_text !== '[Photo Message]' ? `Legenda: ${user_text}\n` : '';
                user_text = `${cap}[Imagem]: ${result}`;
                await sendTelegram(chat_id, `📷 *Imagem analisada:*\n${result}`);
            }
        } catch (e) {
            console.error('[MEDIA]', e.message);
            await sendTelegram(chat_id, `😓 Erro ao processar mídia: ${e.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
            return Response.json({ status: 'media_error' });
        }
    }

    await sendAction(chat_id, 'typing');

    // ── Sessão e contexto ─────────────────────────────────────────────────────
    let session = (await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }))[0];
    if (!session) session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });

    const [companies, accounts] = await Promise.all([
        base44.asServiceRole.entities.Company.filter({ is_active: true }),
        base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true })
    ]);

    const cid = session.selected_company_id;
    const activeName = companies.find(c => c.id === cid)?.name || 'Nenhuma';
    const today = new Date().toLocaleDateString('pt-BR');

    const financialCtx = await loadFinancialContext(base44, companies, accounts, cid);

    const history = (session.history || []).slice(-8).map(m =>
        `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 150)}`
    ).join('\n');

    // ── Prompt ────────────────────────────────────────────────────────────────
    const prompt = `Você é um assistente financeiro de uma empresa com 3 filiais (mineração de calcário).
Data: ${today}

FILIAIS DISPONÍVEIS:
${companies.map(c => `  • ${c.name} → ID: ${c.id}`).join('\n')}

FILIAL ATIVA: ${activeName} (ID: ${cid || 'nenhuma'})

SITUAÇÃO FINANCEIRA (tempo real):
${financialCtx}

CONTAS BANCÁRIAS:
${accounts.map(a => `  • ${a.name} | ${companies.find(c=>c.id===a.company_id)?.name||'?'} | ${brl(a.current_balance)}`).join('\n') || '(nenhuma)'}

${history ? `HISTÓRICO:\n${history}\n` : ''}
MENSAGEM DO USUÁRIO: ${user_text}

INSTRUÇÕES:
- Responda em JSON com os campos: action, reply, e os dados específicos da ação.
- Para consultar transações/lançamentos: action="search_transactions", query={type, status, company_name, payment_date}
  * "lançamentos", "fluxo de caixa", "entradas e saídas", "o que foi pago/recebido hoje" → status="pago", payment_date=hoje (${new Date().toISOString().split('T')[0]})
  * "contas a pagar", "contas a receber", "pendências", "atrasados" → status="aberto" ou status="atrasado"
  * Nunca misture lançamentos (pago) com contas pendentes (pendente/atrasado) na mesma busca
- Para lançar: action="add_transaction", transaction={description, amount, type, category, due_date, is_paid}
- Para dar baixa: action="pay_bill", payment={search_term, amount}
- Para cadastrar contato: action="create_contact", contact={name, phone, email, type}
- Para buscar produtos: action="search_products", search_term="..."
- Para gráfico: action="generate_chart", chart={type, title, labels, datasets}
- Para respostas informativas: action="reply"
- Se mencionar filial por nome (ex: "santarém", "mucajai", "roraima"), coloque em query.company_name ou target_company
- Se type não mencionado em busca de "contas a pagar" → use type="despesa"
- Se status não mencionado em "contas a pagar" → use status="aberto"
- Seja direto, use emojis, valores em R$ X.XXX,XX`;

    // ── Chamar LLM ────────────────────────────────────────────────────────────
    let aiResponse;
    try {
        aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: 'object',
                properties: {
                    action: { type: 'string' },
                    reply: { type: 'string' },
                    target_company: { type: 'string' },
                    transaction: { type: 'object', additionalProperties: true },
                    payment: { type: 'object', additionalProperties: true },
                    query: { type: 'object', additionalProperties: true },
                    contact: { type: 'object', additionalProperties: true },
                    search_term: { type: 'string' },
                    chart: { type: 'object', additionalProperties: true }
                },
                required: ['action', 'reply']
            }
        });
        if (!aiResponse) throw new Error('Resposta vazia');
        if (!aiResponse.action) aiResponse.action = 'reply';
        console.log(`[v9] action=${aiResponse.action}`);
    } catch (e) {
        console.error('[LLM]', e.message);
        await sendTelegram(chat_id, '😵‍💫 Erro na IA. Tente novamente.');
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {});
        return Response.json({ status: 'llm_error', error: e.message });
    }

    // ── Executar ação ─────────────────────────────────────────────────────────
    let finalReply = aiResponse.reply || 'Ok.';
    if (aiResponse.action !== 'reply') {
        try {
            const result = await executeAction(base44, aiResponse.action, aiResponse, companies, accounts, session, chat_id);
            if (result) finalReply = result;
        } catch (e) {
            console.error('[ACTION]', e.message);
            finalReply = `⚠️ Erro: ${e.message}`;
        }
    }

    // ── Salvar histórico e responder ──────────────────────────────────────────
    let hist = [...(session.history || [])];
    hist.push({ role: 'user', content: user_text });
    hist.push({ role: 'assistant', content: finalReply });
    if (hist.length > 20) hist = hist.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history: hist }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {})
    ]);

    return Response.json({ status: 'success', action: aiResponse.action });
});