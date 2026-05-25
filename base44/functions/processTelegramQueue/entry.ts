// processTelegramQueue v14 - multi-filial corrigido + relatórios diário/mensal/trimestral
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const today = () => new Date().toISOString().split('T')[0];
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '-';

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
    // Quebra em blocos de 4000 chars para não estourar limite do Telegram
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= 4000) {
            chunks.push(remaining);
            break;
        }
        // Cortar no último \n antes de 4000
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
            // fallback sem markdown
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
        case 'today':     return { start: fmt(now), end: fmt(now) };
        case 'yesterday': { const d = new Date(now); d.setDate(d.getDate()-1); return { start: fmt(d), end: fmt(d) }; }
        case 'this_week': {
            const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() || 7) + 1);
            const sun = new Date(mon); sun.setDate(mon.getDate()+6);
            return { start: fmt(mon), end: fmt(sun) };
        }
        case 'last_week': {
            const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() || 7) + 1 - 7);
            const sun = new Date(mon); sun.setDate(mon.getDate()+6);
            return { start: fmt(mon), end: fmt(sun) };
        }
        case 'this_month':  return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m+1, 0)) };
        case 'last_month':  return { start: fmt(new Date(y, m-1, 1)), end: fmt(new Date(y, m, 0)) };
        case 'this_quarter': {
            const q = Math.floor(m / 3);
            return { start: fmt(new Date(y, q*3, 1)), end: fmt(new Date(y, q*3+3, 0)) };
        }
        case 'last_quarter': {
            const q = Math.floor(m / 3) - 1;
            const qy = q < 0 ? y - 1 : y;
            const qq = q < 0 ? 3 : q;
            return { start: fmt(new Date(qy, qq*3, 1)), end: fmt(new Date(qy, qq*3+3, 0)) };
        }
        case 'this_year':  return { start: `${y}-01-01`, end: `${y}-12-31` };
        case 'last_year':  return { start: `${y-1}-01-01`, end: `${y-1}-12-31` };
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

// ── Determinar quais filiais usar para o relatório ────────────────────────────
// all_companies=true  → todas as filiais (pedido explícito)
// company_name=X      → só essa filial
// sem nenhum dos dois → filial ativa da sessão (se houver), senão todas
function resolveTargets(ai, companies, session) {
    const { query = {}, target_company } = ai;
    if (query.all_companies === true || query.all_companies === 'true') return companies;
    const hint = query.company_name || target_company;
    if (hint) {
        const found = resolveCompany(companies, hint);
        if (found) return [found];
    }
    if (session.selected_company_id) {
        const active = companies.find(c => c.id === session.selected_company_id);
        if (active) return [active];
    }
    return companies; // fallback: todas
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

    const prompt = `Você é FINAN, assistente financeiro de uma empresa de mineração de calcário com múltiplas filiais.
Hoje: ${today()}
Filial ativa na sessão: ${activeName} (ID: ${cid || 'nenhuma'})

FILIAIS CADASTRADAS:
${companyList}

SALDOS:
${accountList}

${history ? `HISTÓRICO:\n${history}\n` : ''}
MENSAGEM: "${userText}"

REGRAS CRÍTICAS DE FILIAL:
- Se o usuário pedir "todas as filiais", "todas", "geral", "consolidado" → use all_companies=true no query
- Se o usuário mencionar uma filial pelo nome (ex: "Santarém", "Roraima", "Sertanejo") → use company_name com o nome exato da lista acima
- Se nenhuma filial for mencionada → use a filial ativa (não preencha company_name nem all_companies)
- NUNCA misture filiais: cada filial tem seu próprio ID, use o ID correto da lista

PERÍODOS DISPONÍVEIS:
today | yesterday | this_week | last_week | this_month | last_month | this_quarter | last_quarter | this_year | last_year

MAPEAMENTO:
- "oi/olá/bom dia" → reply (apresentação)
- "saldo/caixa/quanto tenho" → check_balance
- "vencimentos/o que vence" → upcoming_bills
- "relatório de hoje/fluxo do dia/fechamento" → daily_report (query.date=hoje ou data específica)
- "relatório mensal/do mês/resultado do mês" → financial_summary (query.period=this_month)
- "relatório trimestral/do trimestre" → financial_summary (query.period=this_quarter)
- "relatório anual/do ano" → financial_summary (query.period=this_year)
- "recebi X/entrou X" → add_transaction (type=receita, is_paid=true)
- "paguei X/gastei X" → add_transaction (type=despesa, is_paid=true)
- "conta a pagar de X" → add_transaction (type=despesa, is_paid=false)
- "dar baixa/quitar/paguei a conta" → pay_bill
- "lançamentos/movimentações/extrato" → search_transactions

AÇÕES:
- reply
- financial_summary → query={company_name?, all_companies?, period?}
- daily_report → query={company_name?, all_companies?, date?}
- check_balance → query={company_name?, all_companies?}
- search_transactions → query={type?, status?, company_name?, all_companies?, period?, keyword?}
- upcoming_bills → query={company_name?, all_companies?, days?, type?}
- add_transaction → transaction={description, amount, type, category, due_date?, payment_date?, is_paid?, contact_name?}
- pay_bill → payment={search_term, amount?, payment_date?}
- select_company → target_company=nome
- search_contacts → search_term=nome
- create_contact → contact={name, phone?, email?, type?}

CATEGORIAS:
- receita: "Vendas", "Serviços", "Outras Receitas"
- despesa: "Combustível", "Manutenção", "Salários", "Fornecedores", "Administrativo", "Outras Despesas"

RESPONDA APENAS JSON (sem texto fora do JSON):
{ "action": "...", "reply": "...", "target_company": "", "query": {}, "transaction": {}, "payment": {}, "contact": {}, "search_term": "" }`;

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
                payment: { type: 'object', additionalProperties: true },
                contact: { type: 'object', additionalProperties: true },
                search_term: { type: 'string' }
            },
            required: ['action', 'reply']
        }
    });
    console.log(`[classify] action=${result?.action} company=${result?.query?.company_name||result?.target_company||'-'} all=${result?.query?.all_companies||false}`);
    return result;
}

// ── PHASE 2: Executar ação ────────────────────────────────────────────────────
async function executeAction(base44, ai, companies, accounts, session) {
    const { action, query = {}, transaction: td = {}, payment: pd = {}, contact: cd = {}, target_company } = ai;

    // Resolver filial para ações que precisam de UMA filial (lançamentos, pay_bill etc.)
    const companyHint = query?.company_name || target_company;
    const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
    const cid = targetComp?.id || session.selected_company_id;

    // Resolver lista de filiais para relatórios (pode ser uma ou todas)
    const targets = resolveTargets(ai, companies, session);

    // ── select_company ────────────────────────────────────────────────────────
    if (action === 'select_company') {
        const nc = resolveCompany(companies, target_company || companyHint);
        if (!nc) {
            return `⚠️ Filial não encontrada: "${target_company}".\n\nFiliais:\n${companies.map(c=>`• ${c.name}`).join('\n')}`;
        }
        await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
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
            const total = compAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);
            msg += `  📊 *Total: ${brl(total)}*\n\n`;
        }
        return msg.trim() || '⚠️ Nenhuma conta encontrada.';
    }

    // ── daily_report ──────────────────────────────────────────────────────────
    if (action === 'daily_report') {
        const reportDate = query.date || today();
        // normalizar data DD/MM/YYYY → YYYY-MM-DD
        const normalizedDate = reportDate.includes('/') 
            ? reportDate.split('/').reverse().join('-') 
            : reportDate;
        const range = { start: normalizedDate, end: normalizedDate };
        const fmtReportDate = normalizedDate.split('-').reverse().join('/');

        let report = `📋 *Relatório Diário — ${fmtReportDate}*\n`;
        if (targets.length > 1) report += `_(${targets.length} filiais)_\n`;
        report += '\n';

        let totalGeralEntradas = 0;
        let totalGeralSaidas = 0;

        for (const comp of targets) {
            const [entradas, saidas, pendDesp, pendRec] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pago' }, '-payment_date', 200),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pago' }, '-payment_date', 200),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }, 'due_date', 50),
            ]);

            const entradasDia = filterByDateRange(entradas, 'payment_date', range);
            const saidasDia   = filterByDateRange(saidas,   'payment_date', range);
            const totalE = entradasDia.reduce((s,t)=>s+t.amount,0);
            const totalS = saidasDia.reduce((s,t)=>s+t.amount,0);
            const resultado = totalE - totalS;
            const saldoCaixa = accounts.filter(a=>a.company_id===comp.id).reduce((s,a)=>s+(a.current_balance||0),0);
            const vencendoHoje = [...pendDesp,...pendRec].filter(t=>t.due_date===today());

            totalGeralEntradas += totalE;
            totalGeralSaidas   += totalS;

            report += `🏢 *${comp.name}*\n`;

            if (entradasDia.length > 0) {
                report += `📥 *Entradas (${entradasDia.length}) — ${brl(totalE)}*\n`;
                entradasDia.slice(0,5).forEach(t => {
                    report += `  ✅ ${t.description} | ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}\n`;
                });
                if (entradasDia.length > 5) report += `  _(+${entradasDia.length-5} mais)_\n`;
            } else {
                report += `📥 Entradas: nenhuma\n`;
            }

            if (saidasDia.length > 0) {
                report += `📤 *Saídas (${saidasDia.length}) — ${brl(totalS)}*\n`;
                saidasDia.slice(0,5).forEach(t => {
                    report += `  ✅ ${t.description} | ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}\n`;
                });
                if (saidasDia.length > 5) report += `  _(+${saidasDia.length-5} mais)_\n`;
            } else {
                report += `📤 Saídas: nenhuma\n`;
            }

            report += `📊 Resultado: ${resultado>=0?'🟢':'🔴'} *${brl(resultado)}* | Caixa: *${brl(saldoCaixa)}*\n`;

            if (vencendoHoje.length > 0) {
                report += `⏰ Vence hoje: ${vencendoHoje.slice(0,3).map(t=>`${t.description} (${brl(t.amount)})`).join(', ')}\n`;
            }
            report += '\n';
        }

        // Consolidado se mais de uma filial
        if (targets.length > 1) {
            const resGeral = totalGeralEntradas - totalGeralSaidas;
            report += `${'─'.repeat(28)}\n`;
            report += `📊 *CONSOLIDADO*\n`;
            report += `📥 Total entradas: *${brl(totalGeralEntradas)}*\n`;
            report += `📤 Total saídas: *${brl(totalGeralSaidas)}*\n`;
            report += `💼 Resultado: ${resGeral>=0?'🟢':'🔴'} *${brl(resGeral)}*\n`;
        }

        return report.trim();
    }

    // ── financial_summary ─────────────────────────────────────────────────────
    if (action === 'financial_summary') {
        const period = query.period || 'this_month';
        const dateRange = getDateRange(period) 
            || (query.start_date ? { start: query.start_date, end: query.end_date || today() } : null);
        const periodLabel = PERIOD_LABELS[period] || period;

        let report = `📊 *Resumo Financeiro — ${periodLabel}*\n`;
        if (targets.length > 1) report += `_(${targets.length} filiais)_\n`;
        report += '\n';

        let totalGeralR = 0;
        let totalGeralD = 0;

        for (const comp of targets) {
            const [allPaid, pendDesp, atrDesp, pendRec, atrRec] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, status: 'pago' }, '-payment_date', 500),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'atrasado' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'atrasado' }),
            ]);

            const paid = filterByDateRange(allPaid, 'payment_date', dateRange);
            const receitas = paid.filter(t => t.type === 'receita');
            const despesas = paid.filter(t => t.type === 'despesa');
            const totalR = receitas.reduce((s,t)=>s+t.amount,0);
            const totalD = despesas.reduce((s,t)=>s+t.amount,0);
            const resultado = totalR - totalD;
            const saldo = accounts.filter(a => a.company_id === comp.id).reduce((s, a) => s + (a.current_balance||0), 0);

            totalGeralR += totalR;
            totalGeralD += totalD;

            // Top 4 categorias de despesa
            const catMap = {};
            despesas.forEach(t => { catMap[t.category||'Outros'] = (catMap[t.category||'Outros']||0) + t.amount; });
            const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,4)
                .map(([cat,v]) => `  └ ${cat}: ${brl(v)}`).join('\n');

            report += `🏢 *${comp.name}*\n`;
            report += `💰 Receitas: *${brl(totalR)}* (${receitas.length})\n`;
            report += `💸 Despesas: *${brl(totalD)}* (${despesas.length})\n`;
            report += `📊 Resultado: ${resultado>=0?'🟢':'🔴'} *${brl(resultado)}*\n`;
            report += `🏦 Saldo caixa: *${brl(saldo)}*\n`;
            report += `📋 Pendências: 💸${brl(pendDesp.reduce((s,t)=>s+t.amount,0))}(${pendDesp.length}) | 💰${brl(pendRec.reduce((s,t)=>s+t.amount,0))}(${pendRec.length})\n`;
            if (atrDesp.length || atrRec.length) {
                report += `🔴 Atrasados: 💸${brl(atrDesp.reduce((s,t)=>s+t.amount,0))}(${atrDesp.length}) | 💰${brl(atrRec.reduce((s,t)=>s+t.amount,0))}(${atrRec.length})\n`;
            }
            if (topCats) report += `*Top despesas:*\n${topCats}\n`;
            report += '\n';
        }

        // Consolidado
        if (targets.length > 1) {
            const resGeral = totalGeralR - totalGeralD;
            report += `${'─'.repeat(28)}\n`;
            report += `📊 *CONSOLIDADO — ${periodLabel}*\n`;
            report += `💰 Total receitas: *${brl(totalGeralR)}*\n`;
            report += `💸 Total despesas: *${brl(totalGeralD)}*\n`;
            report += `💼 Resultado: ${resGeral>=0?'🟢':'🔴'} *${brl(resGeral)}*\n`;
        }

        return report.trim() || '📊 Sem dados para o período.';
    }

    // ── search_transactions ───────────────────────────────────────────────────
    if (action === 'search_transactions') {
        const filter = {};
        // Para search, respeitar filial ativa ou a mencionada
        const searchCid = targetComp?.id || session.selected_company_id;
        if (searchCid && query.all_companies !== true) filter.company_id = searchCid;
        if (query.type && ['receita','despesa'].includes(query.type)) filter.type = query.type;
        if (query.category) filter.category = query.category;

        const dateRange = query.period ? getDateRange(query.period)
            : (query.start_date ? { start: query.start_date, end: query.end_date || today() } : null);
        const dateField = query.status === 'pago' ? 'payment_date' : 'due_date';

        let txs = [];
        if (!query.status || query.status === 'all') {
            txs = await base44.asServiceRole.entities.Transaction.filter(filter, '-payment_date', 150);
            txs = filterByDateRange(txs, 'payment_date', dateRange);
        } else if (query.status === 'aberto') {
            const [p1,p2,p3] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'pendente' }, 'due_date', 60),
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'atrasado' }, 'due_date', 60),
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'parcial'  }, 'due_date', 30),
            ]);
            txs = [...p1,...p2,...p3];
            if (dateRange) txs = filterByDateRange(txs, 'due_date', dateRange);
        } else {
            txs = await base44.asServiceRole.entities.Transaction.filter({ ...filter, status: query.status }, `-${dateField}`, 100);
            txs = filterByDateRange(txs, dateField, dateRange);
        }

        if (query.keyword) {
            const kw = query.keyword.toLowerCase();
            txs = txs.filter(t => t.description?.toLowerCase().includes(kw) || t.contact_name?.toLowerCase().includes(kw));
        }

        if (!txs.length) return `🔍 Nenhuma transação encontrada.`;

        const sIcon = { pago:'✅', pendente:'🟡', atrasado:'🔴', parcial:'🟠' };
        const showComp = !searchCid || query.all_companies === true;
        const lines = txs.slice(0, 20).map(t => {
            const compName = showComp ? companies.find(c => c.id === t.company_id)?.name : null;
            const dateVal = t.status === 'pago' ? fmtDate(t.payment_date) : fmtDate(t.due_date);
            const datePfx = t.status === 'pago' ? 'pg' : 'venc';
            return `${sIcon[t.status]||'▪️'} *${t.description}*${compName?` [${compName}]`:''}\n   └ ${brl(t.amount)} | ${t.type==='receita'?'📥':'📤'} ${datePfx} ${dateVal}${t.category?` | ${t.category}`:''}`;
        });

        const totalR = txs.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0);
        const totalD = txs.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0);
        const header = `📊 *${txs.length} transação(ões)*`;
        const footer = totalR>0&&totalD>0 ? `📥 ${brl(totalR)} | 📤 ${brl(totalD)}` : `*Total: ${brl(totalR||totalD)}*`;
        return `${header}\n\n${lines.join('\n\n')}\n\n${footer}`;
    }

    // ── upcoming_bills ────────────────────────────────────────────────────────
    if (action === 'upcoming_bills') {
        const days = query.days || 7;
        const now = new Date();
        const limit = new Date(now); limit.setDate(now.getDate() + days);
        const range = { start: today(), end: limit.toISOString().split('T')[0] };

        let msg = `📅 *Vencimentos — Próximos ${days} dias*\n`;
        if (targets.length > 1) msg += `_(todas as filiais)_\n`;
        msg += '\n';

        let allPend = [], allAtras = [];
        for (const comp of targets) {
            const f = { company_id: comp.id, status: 'pendente' };
            const fa = { company_id: comp.id, status: 'atrasado' };
            if (query.type && ['receita','despesa'].includes(query.type)) {
                f.type = query.type;
                fa.type = query.type;
            }
            const [p, a] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter(f, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter(fa, 'due_date', 20),
            ]);
            allPend  = [...allPend,  ...p.map(t=>({...t, _comp: comp.name}))];
            allAtras = [...allAtras, ...a.map(t=>({...t, _comp: comp.name}))];
        }

        const upcoming = filterByDateRange(allPend, 'due_date', range);
        upcoming.sort((a,b)=>a.due_date.localeCompare(b.due_date));
        allAtras.sort((a,b)=>a.due_date.localeCompare(b.due_date));

        if (allAtras.length) {
            msg += `🔴 *Vencidos (${allAtras.length}):*\n`;
            allAtras.slice(0,8).forEach(t => {
                msg += `  • ${t.description}${targets.length>1?` [${t._comp}]`:''} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`;
            });
            msg += '\n';
        }
        if (upcoming.length) {
            msg += `🟡 *A vencer (${upcoming.length}):*\n`;
            upcoming.slice(0,12).forEach(t => {
                msg += `  • ${t.description}${targets.length>1?` [${t._comp}]`:''} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`;
            });
        }
        if (!allAtras.length && !upcoming.length) msg += '✅ Nenhum vencimento próximo!';
        return msg.trim();
    }

    // ── add_transaction ───────────────────────────────────────────────────────
    if (action === 'add_transaction') {
        if (!cid) return '⚠️ Informe a filial antes de lançar.';
        let due = td.due_date || today();
        if (due.includes('/')) { const p = due.split('/'); due = `${p[2]}-${p[1]}-${p[0]}`; }
        const acct = accounts.find(a=>a.id===td.account_id)
            || accounts.find(a=>a.company_id===cid && a.type==='caixa')
            || accounts.find(a=>a.company_id===cid);
        const isPaid = td.is_paid === true || td.is_paid === 'true' || td.status === 'pago';
        await base44.asServiceRole.entities.Transaction.create({
            description: td.description || 'Lançamento via Bot',
            amount: Number(td.amount),
            original_amount: Number(td.amount),
            type: td.type || 'despesa',
            category: td.category || (td.type==='receita'?'Outras Receitas':'Outras Despesas'),
            status: isPaid ? 'pago' : 'pendente',
            paid_amount: isPaid ? Number(td.amount) : 0,
            due_date: due,
            payment_date: isPaid ? (td.payment_date || today()) : null,
            account_id: acct?.id || null,
            company_id: cid,
            contact_name: td.contact_name || null,
            notes: 'Via TelegramBot'
        });
        const comp = companies.find(c=>c.id===cid);
        return `✅ *${td.type==='receita'?'Receita':'Despesa'} lançada!*\n📝 ${td.description}\n💰 ${brl(td.amount)}\n📁 ${td.category||'Outras'}\n🏢 ${comp?.name||''}\n📅 ${fmtDate(due)}\n${isPaid?'✅ Pago':'🟡 Pendente'}`;
    }

    // ── pay_bill ──────────────────────────────────────────────────────────────
    if (action === 'pay_bill') {
        if (!cid) return '⚠️ Informe a filial.';
        const [p1,p2] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter({ company_id: cid, status: 'pendente' }),
            base44.asServiceRole.entities.Transaction.filter({ company_id: cid, status: 'atrasado' }),
        ]);
        const pending = [...p1,...p2];
        const term = (pd.search_term || '').toLowerCase();
        const match = pending.find(t =>
            (!term || t.description.toLowerCase().includes(term)) &&
            (!pd.amount || Math.abs(t.amount - pd.amount) < t.amount * 0.3)
        );
        if (!match) {
            const sug = pending.filter(t=>t.description.toLowerCase().includes(term.split(' ')[0]||'')).slice(0,3)
                .map(t=>`  • ${t.description} | ${brl(t.amount)}`).join('\n');
            return `⚠️ Conta não encontrada: *"${pd.search_term}"*${sug?`\n\nSimilares:\n${sug}`:''}`;
        }
        await base44.asServiceRole.entities.Transaction.update(match.id, {
            status: 'pago', paid_amount: match.amount, payment_date: pd.payment_date || today()
        });
        return `✅ *Baixa realizada!*\n📝 ${match.description}\n💰 ${brl(match.amount)}\n📅 ${fmtDate(pd.payment_date || today())}`;
    }

    // ── create_contact ────────────────────────────────────────────────────────
    if (action === 'create_contact') {
        if (!cid) return '⚠️ Informe a filial.';
        const existing = await base44.asServiceRole.entities.Contact.filter({ company_id: cid });
        const dup = existing.find(c=>c.name.toLowerCase().includes((cd.name||'').toLowerCase()));
        if (dup) return `⚠️ Contato já existe: *${dup.name}*`;
        const nc = await base44.asServiceRole.entities.Contact.create({ ...cd, company_id: cid, type: cd.type || 'cliente' });
        return `✅ *Cadastrado!*\n👤 ${nc.name}\n📞 ${nc.phone||'-'}\n📧 ${nc.email||'-'}`;
    }

    // ── search_contacts ───────────────────────────────────────────────────────
    if (action === 'search_contacts') {
        const filter = {};
        const searchCid2 = targetComp?.id || session.selected_company_id;
        if (searchCid2 && query.all_companies !== true) filter.company_id = searchCid2;
        const all = await base44.asServiceRole.entities.Contact.filter(filter, 'name', 30);
        const term = (ai.search_term || '').toLowerCase();
        const found = term ? all.filter(c=>c.name.toLowerCase().includes(term)) : all.slice(0,12);
        if (!found.length) return '🔍 Nenhum contato encontrado.';
        return `👥 *Contatos (${found.length}):*\n` + found.map(c=>`  • *${c.name}* | ${c.type} | ${c.phone||'-'}`).join('\n');
    }

    return null;
}

// ── Processar mídia ────────────────────────────────────────────────────────────
async function processMedia(base44, mediaType, fileId, userText) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`getFile failed`);
    const dl = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`);
    const blob = new Blob([await dl.arrayBuffer()]);
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    if (mediaType === 'voice') {
        return await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: file_url });
    }
    const cap = userText && userText !== '[Photo Message]' ? `Legenda: ${userText}\n` : '';
    const desc = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `${cap}Analise esta imagem. Se for comprovante/nota fiscal, extraia: valor, data, fornecedor, descrição. Seja objetivo.`,
        file_urls: [file_url]
    });
    return `${cap}[Imagem]: ${desc}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (!BOT_TOKEN) return Response.json({ error: 'No BOT_TOKEN' }, { status: 500 });
    const base44 = createClientFromRequest(req);

    let payload;
    try { payload = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }

    const item = payload.data;
    if (!item?.user_text) return Response.json({ status: 'ignored' });

    let { chat_id, user_text, id: queueId, media_type, voice_file_id, photo_file_id } = item;
    chat_id = String(chat_id);
    console.log(`[v14] chat=${chat_id} type=${media_type} text="${user_text?.slice(0,80)}"`);

    if (media_type === 'voice' && voice_file_id) {
        await sendAction(chat_id, 'record_voice');
        try {
            user_text = await processMedia(base44, 'voice', voice_file_id, user_text);
            await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
        } catch (e) {
            await sendTelegram(chat_id, `😓 Erro ao transcrever áudio: ${e.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{});
            return Response.json({ status: 'media_error' });
        }
    } else if (media_type === 'photo' && photo_file_id) {
        await sendAction(chat_id, 'upload_photo');
        try {
            user_text = await processMedia(base44, 'photo', photo_file_id, user_text);
            await sendTelegram(chat_id, `📷 _Imagem recebida e analisada_`);
        } catch (e) {
            await sendTelegram(chat_id, `😓 Erro ao analisar imagem: ${e.message}`);
            await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{});
            return Response.json({ status: 'media_error' });
        }
    }

    await sendAction(chat_id, 'typing');

    const [sessionList, companies, accounts] = await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }),
        base44.asServiceRole.entities.Company.filter({ is_active: true }),
        base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true })
    ]);

    let session = sessionList[0];
    if (!session) session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });

    let ai;
    try {
        ai = await classifyIntent(base44, user_text, session, companies, accounts);
        if (!ai?.action) ai = { action: 'reply', reply: 'Não entendi. Pode reformular?' };
        console.log(`[v14] action=${ai.action} all=${ai.query?.all_companies||false} comp=${ai.query?.company_name||ai.target_company||'-'}`);
    } catch (e) {
        console.error('[LLM]', e.message);
        await sendTelegram(chat_id, '😵 Erro na IA. Tente novamente.');
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{});
        return Response.json({ status: 'llm_error' });
    }

    // Atualizar filial na sessão somente se ação for select_company ou sessão sem filial
    if (ai.action === 'select_company' || (!session.selected_company_id && (ai.target_company || ai.query?.company_name))) {
        const hint = ai.target_company || ai.query?.company_name;
        if (hint && !['all','todas'].includes(hint.toLowerCase())) {
            const nc = resolveCompany(companies, hint);
            if (nc && nc.id !== session.selected_company_id) {
                await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
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
            const hist = (session.history || []).slice(-6).map(m =>
                `${m.role==='user'?'Usuário':'Assistente'}: ${m.content.slice(0,200)}`).join('\n');
            finalReply = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `Você é FINAN, assistente financeiro de uma empresa de mineração de calcário. Responda em português, de forma concisa.\n\n${hist?`Histórico:\n${hist}\n\n`:''}Usuário: "${user_text}"\n\nResponda diretamente.`
            });
        } catch(e) {
            finalReply = 'Olá! Sou o FINAN. Como posso ajudar?';
        }
    }

    let hist = [...(session.history || [])];
    hist.push({ role: 'user',      content: user_text.slice(0,300) });
    hist.push({ role: 'assistant', content: finalReply.slice(0,300) });
    if (hist.length > 20) hist = hist.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history: hist }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{})
    ]);

    return Response.json({ status: 'success', action: ai.action });
});