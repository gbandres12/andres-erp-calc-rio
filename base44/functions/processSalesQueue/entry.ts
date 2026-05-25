// processSalesQueue v2 - Agente Comercial + Financeiro (SALES BOT)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BOT_TOKEN = Deno.env.get("SALES_BOT_TOKEN");
const today = () => new Date().toISOString().split('T')[0];
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '-';

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= 4000) { chunks.push(remaining); break; }
        let cut = remaining.lastIndexOf('\n', 4000);
        if (cut < 1000) cut = 4000;
        chunks.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).trimStart();
    }
    for (const chunk of chunks) {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
        });
        if (!res.ok) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: chunk.replace(/[*_`]/g, '') })
            });
        }
    }
}

async function sendAction(chatId, action = 'typing') {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
    }).catch(() => {});
}

// ── Datas ─────────────────────────────────────────────────────────────────────
function getDateRange(period) {
    const now = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (period) {
        case 'today':        return { start: fmt(now), end: fmt(now) };
        case 'yesterday':    { const d = new Date(now); d.setDate(d.getDate()-1); return { start: fmt(d), end: fmt(d) }; }
        case 'this_week':    { const mon = new Date(now); mon.setDate(now.getDate()-(now.getDay()||7)+1); const sun = new Date(mon); sun.setDate(mon.getDate()+6); return { start: fmt(mon), end: fmt(sun) }; }
        case 'last_week':    { const mon = new Date(now); mon.setDate(now.getDate()-(now.getDay()||7)+1-7); const sun = new Date(mon); sun.setDate(mon.getDate()+6); return { start: fmt(mon), end: fmt(sun) }; }
        case 'this_month':   return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m+1, 0)) };
        case 'last_month':   return { start: fmt(new Date(y, m-1, 1)), end: fmt(new Date(y, m, 0)) };
        case 'this_quarter': { const q=Math.floor(m/3); return { start: fmt(new Date(y,q*3,1)), end: fmt(new Date(y,q*3+3,0)) }; }
        case 'last_quarter': { const q=Math.floor(m/3)-1; const qy=q<0?y-1:y; const qq=q<0?3:q; return { start: fmt(new Date(qy,qq*3,1)), end: fmt(new Date(qy,qq*3+3,0)) }; }
        case 'this_year':    return { start: `${y}-01-01`, end: `${y}-12-31` };
        case 'last_year':    return { start: `${y-1}-01-01`, end: `${y-1}-12-31` };
        default: return null;
    }
}

const PERIOD_LABELS = {
    today: 'Hoje', yesterday: 'Ontem',
    this_week: 'Esta Semana', last_week: 'Semana Passada',
    this_month: 'Este Mês', last_month: 'Mês Passado',
    this_quarter: 'Este Trimestre', last_quarter: 'Trimestre Passado',
    this_year: 'Este Ano', last_year: 'Ano Passado'
};

function resolveCompany(companies, nameOrId) {
    if (!nameOrId) return null;
    const s = String(nameOrId).toLowerCase().trim();
    return companies.find(c => c.id === nameOrId)
        || companies.find(c => c.name.toLowerCase() === s)
        || companies.find(c => c.name.toLowerCase().includes(s))
        || null;
}

function filterByDateRange(txs, dateField, range) {
    if (!range) return txs;
    return txs.filter(t => t[dateField] && t[dateField] >= range.start && t[dateField] <= range.end);
}

function resolveTargets(ai, companies, session) {
    const { query = {}, target_company } = ai;
    if (query.all_companies === true || query.all_companies === 'true') return companies;
    const hint = query.company_name || target_company;
    if (hint) { const found = resolveCompany(companies, hint); if (found) return [found]; }
    if (session.selected_company_id) {
        const active = companies.find(c => c.id === session.selected_company_id);
        if (active) return [active];
    }
    return companies;
}

// ── PHASE 1: Classificar intent ───────────────────────────────────────────────
async function classifyIntent(base44, userText, session, companies, accounts) {
    const cid = session.selected_company_id;
    const activeName = cid ? (companies.find(c => c.id === cid)?.name || 'desconhecida') : 'nenhuma selecionada';
    const history = (session.history || []).slice(-6)
        .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.slice(0, 150)}`).join('\n');

    const companyList = companies.map(c => `• ${c.name} → ID: ${c.id}`).join('\n');
    const accountList = accounts.map(a => {
        const comp = companies.find(c => c.id === a.company_id);
        return `• ${a.name} [${comp?.name || '?'}]: ${brl(a.current_balance)}`;
    }).join('\n');

    const prompt = `Você é o "Assistente Comercial & Financeiro" da CBA Calcário — Unidade Mucajaí, Roraima.
Você ajuda tanto com VENDAS (leads, cadastro de clientes, pedidos) quanto com FINANCEIRO (relatórios, saldos, lançamentos).
Hoje: ${today()}
Filial ativa: ${activeName} (ID: ${cid || 'nenhuma'})

FILIAIS:
${companyList}

SALDOS:
${accountList}

${history ? `HISTÓRICO:\n${history}\n` : ''}
MENSAGEM: "${userText}"

REGRAS DE FILIAL:
- "todas", "geral", "consolidado" → all_companies=true
- nome de filial mencionado → company_name com nome exato
- sem menção → filial ativa

PERÍODOS: today | yesterday | this_week | last_week | this_month | last_month | this_quarter | last_quarter | this_year | last_year

AÇÕES DISPONÍVEIS:
FINANCEIRO:
- financial_summary → query={company_name?, all_companies?, period?}
- daily_report → query={company_name?, all_companies?, date?}
- check_balance → query={company_name?, all_companies?}
- search_transactions → query={type?, status?, company_name?, all_companies?, period?, keyword?}
- upcoming_bills → query={company_name?, all_companies?, days?, type?}

COMERCIAL:
- search_clients → search_term=nome
- create_client → client={name, city, phone, notes?}
- search_products → search_term=nome
- create_sale → sale={client_name, payment_method, items:[{product_name, quantity}]}

GERAL:
- reply → resposta livre
- select_company → target_company=nome

MAPEAMENTO:
- "saldo/caixa" → check_balance
- "relatório do dia/hoje/fechamento" → daily_report
- "relatório mensal/do mês" → financial_summary (period=this_month)
- "entradas/saídas/lançamentos" → search_transactions
- "vencimentos/o que vence" → upcoming_bills
- "cadastrar cliente/lead" → create_client
- "registrar venda/pedido" → create_sale
- "buscar cliente" → search_clients
- "produtos/estoque" → search_products

RESPONDA APENAS JSON:
{ "action": "...", "reply": "...", "target_company": "", "query": {}, "transaction": {}, "client": {}, "sale": {}, "search_term": "" }`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
            type: 'object',
            properties: {
                action: { type: 'string' },
                reply: { type: 'string' },
                target_company: { type: 'string' },
                query: { type: 'object', additionalProperties: true },
                transaction: { type: 'object', additionalProperties: true },
                client: { type: 'object', additionalProperties: true },
                sale: { type: 'object', additionalProperties: true },
                search_term: { type: 'string' }
            },
            required: ['action', 'reply']
        }
    });
    console.log(`[classify] action=${result?.action}`);
    return result;
}

// ── PHASE 2: Executar ação ────────────────────────────────────────────────────
async function executeAction(base44, ai, companies, accounts, session) {
    const { action, query = {}, client: cd = {}, sale: sd = {}, target_company } = ai;
    const companyHint = query?.company_name || target_company;
    const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
    const cid = targetComp?.id || session.selected_company_id;
    const targets = resolveTargets(ai, companies, session);

    // ── select_company ────────────────────────────────────────────────────────
    if (action === 'select_company') {
        const nc = resolveCompany(companies, target_company || companyHint);
        if (!nc) return `⚠️ Filial não encontrada.\n\nFiliais:\n${companies.map(c=>`• ${c.name}`).join('\n')}`;
        await base44.asServiceRole.entities.SalesTelegramSession.update(session.id, { selected_company_id: nc.id });
        session.selected_company_id = nc.id;
        const saldo = accounts.filter(a=>a.company_id===nc.id).reduce((s,a)=>s+(a.current_balance||0),0);
        return `✅ *Filial: ${nc.name}*\n🏦 Saldo: ${brl(saldo)}\n\nComo posso ajudar?`;
    }

    // ── check_balance ─────────────────────────────────────────────────────────
    if (action === 'check_balance') {
        let msg = '🏦 *Saldos das Contas*\n\n';
        for (const comp of targets) {
            const compAccounts = accounts.filter(a => a.company_id === comp.id);
            if (!compAccounts.length) continue;
            msg += `*${comp.name}*\n`;
            compAccounts.forEach(a => msg += `  ${a.current_balance >= 0 ? '🟢' : '🔴'} ${a.name}: ${brl(a.current_balance)}\n`);
            msg += `  📊 *Total: ${brl(compAccounts.reduce((s,a)=>s+(a.current_balance||0),0))}*\n\n`;
        }
        return msg.trim() || '⚠️ Nenhuma conta encontrada.';
    }

    // ── daily_report ──────────────────────────────────────────────────────────
    if (action === 'daily_report') {
        const reportDate = (query.date || today()).includes('/') ? query.date.split('/').reverse().join('-') : (query.date || today());
        const range = { start: reportDate, end: reportDate };
        let report = `📋 *Relatório Diário — ${reportDate.split('-').reverse().join('/')}*\n${targets.length > 1 ? `_(${targets.length} filiais)_\n` : ''}\n`;
        let totalE = 0, totalS = 0;

        for (const comp of targets) {
            const [entradas, saidas] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pago' }, '-payment_date', 200),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pago' }, '-payment_date', 200),
            ]);
            const eDia = filterByDateRange(entradas, 'payment_date', range);
            const sDia = filterByDateRange(saidas, 'payment_date', range);
            const tE = eDia.reduce((s,t)=>s+t.amount,0);
            const tS = sDia.reduce((s,t)=>s+t.amount,0);
            const saldo = accounts.filter(a=>a.company_id===comp.id).reduce((s,a)=>s+(a.current_balance||0),0);
            totalE += tE; totalS += tS;

            report += `🏢 *${comp.name}*\n`;
            report += `📥 *Entradas (${eDia.length}) — ${brl(tE)}*\n`;
            eDia.slice(0,5).forEach(t => report += `  ✅ ${t.description} | ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}\n`);
            if (eDia.length > 5) report += `  _(+${eDia.length-5} mais)_\n`;
            report += `📤 *Saídas (${sDia.length}) — ${brl(tS)}*\n`;
            sDia.slice(0,5).forEach(t => report += `  ✅ ${t.description} | ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}\n`);
            if (sDia.length > 5) report += `  _(+${sDia.length-5} mais)_\n`;
            report += `📊 Resultado: ${(tE-tS)>=0?'🟢':'🔴'} *${brl(tE-tS)}* | Caixa: *${brl(saldo)}*\n\n`;
        }

        if (targets.length > 1) {
            report += `${'─'.repeat(28)}\n📊 *CONSOLIDADO*\n📥 Entradas: *${brl(totalE)}*\n📤 Saídas: *${brl(totalS)}*\n💼 Resultado: ${(totalE-totalS)>=0?'🟢':'🔴'} *${brl(totalE-totalS)}*`;
        }
        return report.trim();
    }

    // ── financial_summary ─────────────────────────────────────────────────────
    if (action === 'financial_summary') {
        const period = query.period || 'this_month';
        const dateRange = getDateRange(period) || (query.start_date ? { start: query.start_date, end: query.end_date || today() } : null);
        const periodLabel = PERIOD_LABELS[period] || period;
        let report = `📊 *Resumo Financeiro — ${periodLabel}*\n${targets.length > 1 ? `_(${targets.length} filiais)_\n` : ''}\n`;
        let totalR = 0, totalD = 0;

        for (const comp of targets) {
            const [allPaid, pendDesp, pendRec, atrDesp, atrRec] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, status: 'pago' }, '-payment_date', 500),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'atrasado' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'atrasado' }),
            ]);
            const paid = filterByDateRange(allPaid, 'payment_date', dateRange);
            const receitas = paid.filter(t => t.type === 'receita');
            const despesas = paid.filter(t => t.type === 'despesa');
            const tR = receitas.reduce((s,t)=>s+t.amount,0);
            const tD = despesas.reduce((s,t)=>s+t.amount,0);
            const saldo = accounts.filter(a=>a.company_id===comp.id).reduce((s,a)=>s+(a.current_balance||0),0);
            totalR += tR; totalD += tD;

            const catMap = {};
            despesas.forEach(t => { catMap[t.category||'Outros'] = (catMap[t.category||'Outros']||0) + t.amount; });
            const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([cat,v]) => `  └ ${cat}: ${brl(v)}`).join('\n');

            report += `🏢 *${comp.name}*\n`;
            report += `💰 Receitas: *${brl(tR)}* (${receitas.length})\n`;
            report += `💸 Despesas: *${brl(tD)}* (${despesas.length})\n`;
            report += `📊 Resultado: ${(tR-tD)>=0?'🟢':'🔴'} *${brl(tR-tD)}*\n`;
            report += `🏦 Saldo: *${brl(saldo)}*\n`;
            report += `📋 Pendências: 💸${brl(pendDesp.reduce((s,t)=>s+t.amount,0))}(${pendDesp.length}) | 💰${brl(pendRec.reduce((s,t)=>s+t.amount,0))}(${pendRec.length})\n`;
            if (atrDesp.length || atrRec.length) report += `🔴 Atrasados: 💸${brl(atrDesp.reduce((s,t)=>s+t.amount,0))}(${atrDesp.length}) | 💰${brl(atrRec.reduce((s,t)=>s+t.amount,0))}(${atrRec.length})\n`;
            if (topCats) report += `*Top despesas:*\n${topCats}\n`;
            report += '\n';
        }

        if (targets.length > 1) {
            report += `${'─'.repeat(28)}\n📊 *CONSOLIDADO — ${periodLabel}*\n💰 Receitas: *${brl(totalR)}*\n💸 Despesas: *${brl(totalD)}*\n💼 Resultado: ${(totalR-totalD)>=0?'🟢':'🔴'} *${brl(totalR-totalD)}*`;
        }
        return report.trim() || '📊 Sem dados para o período.';
    }

    // ── upcoming_bills ────────────────────────────────────────────────────────
    if (action === 'upcoming_bills') {
        const days = query.days || 7;
        const limit = new Date(); limit.setDate(limit.getDate() + days);
        const range = { start: today(), end: limit.toISOString().split('T')[0] };
        let msg = `📅 *Vencimentos — Próximos ${days} dias*\n\n`;
        let allPend = [], allAtras = [];
        for (const comp of targets) {
            const [p, a] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, status: 'pendente' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, status: 'atrasado' }, 'due_date', 20),
            ]);
            allPend  = [...allPend,  ...p.map(t=>({...t, _comp: comp.name}))];
            allAtras = [...allAtras, ...a.map(t=>({...t, _comp: comp.name}))];
        }
        const upcoming = filterByDateRange(allPend, 'due_date', range).sort((a,b)=>a.due_date.localeCompare(b.due_date));
        if (allAtras.length) {
            msg += `🔴 *Vencidos (${allAtras.length}):*\n`;
            allAtras.slice(0,8).forEach(t => msg += `  • ${t.description}${targets.length>1?` [${t._comp}]`:''} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
            msg += '\n';
        }
        if (upcoming.length) {
            msg += `🟡 *A vencer (${upcoming.length}):*\n`;
            upcoming.slice(0,12).forEach(t => msg += `  • ${t.description}${targets.length>1?` [${t._comp}]`:''} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
        }
        if (!allAtras.length && !upcoming.length) msg += '✅ Nenhum vencimento próximo!';
        return msg.trim();
    }

    // ── search_transactions ───────────────────────────────────────────────────
    if (action === 'search_transactions') {
        const filter = {};
        const searchCid = targetComp?.id || session.selected_company_id;
        if (searchCid && query.all_companies !== true) filter.company_id = searchCid;
        if (query.type) filter.type = query.type;
        const dateRange = query.period ? getDateRange(query.period) : null;
        let txs = await base44.asServiceRole.entities.Transaction.filter(filter, '-payment_date', 150);
        if (dateRange) txs = filterByDateRange(txs, 'payment_date', dateRange);
        if (query.keyword) { const kw = query.keyword.toLowerCase(); txs = txs.filter(t => t.description?.toLowerCase().includes(kw)); }
        if (!txs.length) return '🔍 Nenhuma transação encontrada.';
        const sIcon = { pago:'✅', pendente:'🟡', atrasado:'🔴', parcial:'🟠' };
        const lines = txs.slice(0, 20).map(t =>
            `${sIcon[t.status]||'▪️'} *${t.description}*\n   └ ${brl(t.amount)} | ${t.type==='receita'?'📥':'📤'} ${fmtDate(t.payment_date||t.due_date)}${t.category?` | ${t.category}`:''}`
        );
        const tR = txs.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0);
        const tD = txs.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0);
        return `📊 *${txs.length} lançamento(s)*\n\n${lines.join('\n\n')}\n\n📥 ${brl(tR)} | 📤 ${brl(tD)}`;
    }

    // ── search_clients ────────────────────────────────────────────────────────
    if (action === 'search_clients') {
        if (!cid) return '⚠️ Selecione uma filial primeiro.';
        const all = await base44.asServiceRole.entities.Contact.filter({ company_id: cid, type: 'cliente' }, 'name', 30);
        const term = (ai.search_term || '').toLowerCase();
        const found = term ? all.filter(c=>c.name.toLowerCase().includes(term)) : all.slice(0,10);
        if (!found.length) return '🔍 Nenhum cliente encontrado.';
        return `👥 *Clientes (${found.length}):*\n` + found.map(c=>`  • *${c.name}* | ${c.city||'-'} | ${c.phone||'-'}`).join('\n');
    }

    // ── search_products ───────────────────────────────────────────────────────
    if (action === 'search_products') {
        if (!cid) return '⚠️ Selecione uma filial primeiro.';
        const term = ai.search_term || '';
        const prods = await base44.asServiceRole.entities.Product.filter({ company_id: cid, is_active: true }, 'name', 20);
        const found = term ? prods.filter(p=>p.name.toLowerCase().includes(term.toLowerCase())) : prods.slice(0,10);
        if (!found.length) return `🔍 Nenhum produto encontrado.`;
        return `📦 *Produtos (${found.length}):*\n` + found.map(p=>`  • *${p.name}* | ${brl(p.sale_price)} | Est: ${p.current_stock} ${p.unit}`).join('\n');
    }

    // ── create_client ─────────────────────────────────────────────────────────
    if (action === 'create_client') {
        if (!cid) return '⚠️ Selecione a filial primeiro.';
        const comp = companies.find(c=>c.id===cid);
        const existing = (await base44.asServiceRole.entities.Contact.filter({ name: cd.name, company_id: cid }))[0];
        if (existing) return `⚠️ Cliente *${existing.name}* já existe na filial ${comp?.name}!`;
        const nc = await base44.asServiceRole.entities.Contact.create({ ...cd, company_id: cid, type: 'cliente', status: 'prospect' });
        return `✅ *Cliente Cadastrado!*\n👤 ${nc.name}\n🏢 ${comp?.name}\n📍 ${nc.city||'-'}\n📞 ${nc.phone||'-'}`;
    }

    // ── create_sale ───────────────────────────────────────────────────────────
    if (action === 'create_sale') {
        if (!cid) return '⚠️ Selecione a filial primeiro.';
        const client = (await base44.asServiceRole.entities.Contact.filter({ name: { $regex: sd.client_name, $options: 'i' }, company_id: cid }))[0];
        if (!client) return `❌ Cliente "${sd.client_name}" não encontrado. Cadastre-o primeiro.`;
        let total = 0, items = [];
        for (const item of (sd.items || [])) {
            const prod = (await base44.asServiceRole.entities.Product.filter({ name: { $regex: item.product_name, $options: 'i' }, company_id: cid }))[0];
            if (prod) { const sub = prod.sale_price * item.quantity; total += sub; items.push({ product_id: prod.id, product_name: prod.name, quantity: item.quantity, unit: prod.unit, unit_price: prod.sale_price, total: sub }); }
        }
        if (!items.length) return '❌ Nenhum produto válido identificado.';
        const sale = await base44.asServiceRole.entities.Sale.create({
            reference: `BOT-${Date.now().toString().slice(-6)}`,
            company_id: cid, client_id: client.id, client_name: client.name,
            seller_name: 'SalesBot', sale_date: today(),
            items, total, subtotal: total,
            payment_method: sd.payment_method || 'dinheiro',
            status: 'rascunho', payment_status: 'pendente',
            notes: 'Venda criada via Assistente Virtual'
        });
        return `✅ *Pedido Registrado!* (Ref: ${sale.reference})\n👤 ${client.name}\n💰 *${brl(total)}*\n📦 ${items.length} produto(s)\nEm breve entraremos em contato para finalizar.`;
    }

    return null;
}

// ── Processar mídia ────────────────────────────────────────────────────────────
async function processMedia(base44, fileId) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    const dl = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`);
    const blob = new Blob([await dl.arrayBuffer()]);
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    return await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: file_url });
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (!BOT_TOKEN) return Response.json({ error: 'No SALES_BOT_TOKEN' }, { status: 500 });
    const base44 = createClientFromRequest(req);

    let payload;
    try { payload = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }

    const item = payload.data;
    if (!item?.chat_id) return Response.json({ status: 'ignored' });

    let { chat_id, user_text, id: queueId, media_type, voice_file_id } = item;
    chat_id = String(chat_id);

    if (media_type === 'voice' && voice_file_id) {
        await sendAction(chat_id, 'record_voice');
        try {
            user_text = await processMedia(base44, voice_file_id);
            await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
        } catch (e) {
            await sendTelegram(chat_id, `😓 Erro ao transcrever áudio: ${e.message}`);
            await base44.asServiceRole.entities.SalesTelegramQueue.delete(queueId).catch(()=>{});
            return Response.json({ status: 'media_error' });
        }
    }

    await sendAction(chat_id, 'typing');

    const [sessionList, companies, accounts] = await Promise.all([
        base44.asServiceRole.entities.SalesTelegramSession.filter({ chat_id }),
        base44.asServiceRole.entities.Company.filter({ is_active: true }),
        base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true })
    ]);

    let session = sessionList[0];
    if (!session) session = await base44.asServiceRole.entities.SalesTelegramSession.create({ chat_id, history: [] });

    let ai;
    try {
        ai = await classifyIntent(base44, user_text, session, companies, accounts);
        if (!ai?.action) ai = { action: 'reply', reply: 'Não entendi. Pode reformular?' };
    } catch (e) {
        console.error('[LLM]', e.message);
        await sendTelegram(chat_id, '😵 Erro na IA. Tente novamente.');
        await base44.asServiceRole.entities.SalesTelegramQueue.delete(queueId).catch(()=>{});
        return Response.json({ status: 'llm_error' });
    }

    if (ai.action === 'select_company' || (!session.selected_company_id && (ai.target_company || ai.query?.company_name))) {
        const hint = ai.target_company || ai.query?.company_name;
        if (hint && !['all','todas'].includes(hint.toLowerCase())) {
            const nc = resolveCompany(companies, hint);
            if (nc && nc.id !== session.selected_company_id) {
                await base44.asServiceRole.entities.SalesTelegramSession.update(session.id, { selected_company_id: nc.id });
                session.selected_company_id = nc.id;
            }
        }
    }

    let finalReply = ai.reply || '';
    if (ai.action !== 'reply') {
        try {
            const result = await executeAction(base44, ai, companies, accounts, session);
            if (result) finalReply = result;
        } catch (e) {
            console.error('[EXEC]', e.message);
            finalReply = `⚠️ Erro ao executar: ${e.message}`;
        }
    }

    if (!finalReply) {
        try {
            finalReply = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `Você é o Assistente Comercial & Financeiro da CBA Calcário. Responda em português, de forma concisa.\n\nUsuário: "${user_text}"\n\nResponda diretamente.`
            });
        } catch(e) {
            finalReply = 'Olá! Sou o Assistente Comercial & Financeiro. Como posso ajudar?';
        }
    }

    let hist = [...(session.history || [])];
    hist.push({ role: 'user', content: user_text.slice(0, 300) });
    hist.push({ role: 'assistant', content: finalReply.slice(0, 300) });
    if (hist.length > 20) hist = hist.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.SalesTelegramSession.update(session.id, { history: hist }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.SalesTelegramQueue.delete(queueId).catch(()=>{})
    ]);

    return Response.json({ status: 'success', action: ai.action });
});