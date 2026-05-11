// processTelegramQueue v13 - 2-phase: classify → execute (faster + smarter)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const today = () => new Date().toISOString().split('T')[0];
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '-';

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
    const safe = text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&').slice(0, 4096);
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    if (!res.ok) {
        // fallback sem markdown
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text.replace(/[*_`]/g, '') })
        });
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
    switch (period) {
        case 'today': return { start: fmt(now), end: fmt(now) };
        case 'yesterday': { const y = new Date(now); y.setDate(y.getDate()-1); return { start: fmt(y), end: fmt(y) }; }
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
        case 'this_month': return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(new Date(now.getFullYear(), now.getMonth()+1, 0)) };
        case 'last_month': return { start: fmt(new Date(now.getFullYear(), now.getMonth()-1, 1)), end: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) };
        case 'this_year': return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
        default: return null;
    }
}

function resolveCompany(companies, nameOrId) {
    if (!nameOrId) return null;
    return companies.find(c => c.id === nameOrId)
        || companies.find(c => c.name.toLowerCase() === nameOrId.toLowerCase())
        || companies.find(c => c.name.toLowerCase().includes(nameOrId.toLowerCase()))
        || null;
}

// ── Filtrar transações por período ────────────────────────────────────────────
function filterByDateRange(txs, dateField, range) {
    if (!range) return txs;
    return txs.filter(t => t[dateField] && t[dateField] >= range.start && t[dateField] <= range.end);
}

// ── PHASE 1: Classificar intent com contexto mínimo ──────────────────────────
async function classifyIntent(base44, userText, session, companies, accounts) {
    const cid = session.selected_company_id;
    const activeName = cid ? (companies.find(c => c.id === cid)?.name || 'desconhecida') : 'nenhuma';
    const history = (session.history || []).slice(-6)
        .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.slice(0, 150)}`).join('\n');

    const todayStr = today();
    const companyList = companies.map(c => `• ${c.name} → ${c.id}`).join('\n');
    const accountList = accounts.map(a => {
        const comp = companies.find(c => c.id === a.company_id);
        return `• ${a.name} (${comp?.name || '?'}): ${brl(a.current_balance)}`;
    }).join('\n');

    const prompt = `Você é FINAN, assistente financeiro especializado de uma empresa de mineração de calcário com múltiplas filiais. Responda SEMPRE em português do Brasil, de forma clara e profissional.
Hoje: ${todayStr}. Filial ativa: ${activeName} (ID: ${cid || 'nenhuma'})

FILIAIS DISPONÍVEIS:
${companyList}

SALDOS ATUAIS POR CONTA:
${accountList}

${history ? `HISTÓRICO DA CONVERSA:\n${history}\n` : ''}
MENSAGEM DO USUÁRIO: "${userText}"

INSTRUÇÕES GERAIS:
1. Classifique a intenção e retorne a action mais adequada.
2. O campo "reply" DEVE ser uma resposta completa em português — nunca deixe vazio ou como placeholder.
3. Se não houver filial ativa, solicite que o usuário informe antes de consultas financeiras. Liste as filiais disponíveis.
4. Para informações insuficientes: classifique como "reply" e diga exatamente o que falta.
5. NUNCA invente dados. Se não tiver certeza, pergunte.
6. Quando o usuário mencionar uma filial pelo nome (ex: "Santarém", "Fazenda"), identifique o ID correto pela lista de filiais e use em target_company.
7. Para operações sem filial específica mencionada, use a filial ativa atual.

MAPEAMENTO DE LINGUAGEM NATURAL:
- "oi/olá/bom dia/boa tarde" → reply com apresentação e lista de capacidades
- "saldo/quanto tenho/caixa" → check_balance
- "o que vence/dívidas/pagar" → upcoming_bills
- "relatório diário/fluxo do dia/como foi hoje/fechamento do dia" → daily_report
- "recebi X/entrou X reais" → add_transaction (type=receita, is_paid=true)
- "paguei X/gastei X" → add_transaction (type=despesa, is_paid=true)
- "tenho conta a pagar de X" → add_transaction (type=despesa, is_paid=false)
- "dar baixa/quitar/paguei a conta de X" → pay_bill
- "resumo/relatório mensal/resultado do mês" → financial_summary
- "lançamentos/movimentações/extrato" → search_transactions

AÇÕES DISPONÍVEIS:
- reply: conversa simples, esclarecimentos, informações insuficientes
- financial_summary: resumo financeiro (receitas/despesas/resultado). query={company_name?, period?}
- daily_report: relatório diário de fluxo de caixa com entradas, saídas e saldo. query={company_name?, date?}
- check_balance: consultar saldo de contas. query={company_name?}
- search_transactions: buscar lançamentos. query={type?, status?, company_name?, period?, start_date?, end_date?, keyword?}
  * type: "receita" ou "despesa" (omita para ambos)
  * status: "pago" | "pendente" | "atrasado" | "aberto" (aberto = pendente+atrasado)
  * period: today|yesterday|this_week|last_week|this_month|last_month|this_year
- upcoming_bills: vencimentos próximos. query={company_name?, days?, type?}
- add_transaction: lançar transação. transaction={description, amount, type, category, due_date?, payment_date?, is_paid?, contact_name?}
  * Categorias receita: "Vendas", "Outras Receitas", "Serviços"
  * Categorias despesa: "Combustível", "Manutenção", "Salários", "Fornecedores", "Administrativo", "Outras Despesas"
- pay_bill: dar baixa em conta pendente. payment={search_term, amount?, payment_date?}
- select_company: trocar filial ativa. target_company=nome_ou_id
- search_contacts: buscar contatos. search_term=nome
- create_contact: cadastrar contato. contact={name, phone?, email?, type, document?}

RESPONDA APENAS JSON:
{ "action": "...", "reply": "...", "target_company": "...", "query": {}, "transaction": {}, "payment": {}, "contact": {}, "search_term": "" }`;

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
    console.log(`[classify] raw result:`, JSON.stringify(result)?.slice(0, 200));
    return result;
}

// ── PHASE 2: Executar ação com dados carregados sob demanda ──────────────────
async function executeAction(base44, ai, companies, accounts, session) {
    const { action, query = {}, transaction: td = {}, payment: pd = {}, contact: cd = {}, target_company } = ai;

    // Resolver filial
    const companyHint = query?.company_name || target_company;
    const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
    const cid = targetComp?.id || session.selected_company_id;

    // ── select_company ────────────────────────────────────────────────────────
    if (action === 'select_company') {
        const nc = resolveCompany(companies, target_company || companyHint);
        if (!nc) {
            return `⚠️ Filial não encontrada: "${target_company}".\n\nFiliais disponíveis:\n${companies.map(c=>`• ${c.name}`).join('\n')}\n\nDigite o nome da filial para selecionar.`;
        }
        await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
        session.selected_company_id = nc.id;
        const compAccounts = accounts.filter(a => a.company_id === nc.id);
        const saldoTotal = compAccounts.reduce((s,a)=>s+(a.current_balance||0),0);
        return `✅ *Filial: ${nc.name}*\n🏦 Saldo total: ${brl(saldoTotal)}\n\nO que deseja fazer?`;
    }

    // ── check_balance ─────────────────────────────────────────────────────────
    if (action === 'check_balance') {
        const targets = targetComp ? [targetComp] : companies;
        let msg = '🏦 *Saldos das Contas*\n\n';
        for (const comp of targets) {
            const compAccounts = accounts.filter(a => a.company_id === comp.id);
            if (!compAccounts.length) continue;
            msg += `*${comp.name}*\n`;
            compAccounts.forEach(a => msg += `  ${a.current_balance >= 0 ? '🟢' : '🔴'} ${a.name}: ${brl(a.current_balance)}\n`);
            const total = compAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);
            msg += `  📊 *Total: ${brl(total)}*\n\n`;
        }
        return msg.trim();
    }

    // ── financial_summary ─────────────────────────────────────────────────────
    if (action === 'financial_summary') {
        const period = query.period || 'this_month';
        const dateRange = getDateRange(period) || (query.start_date ? { start: query.start_date, end: query.end_date || today() } : null);
        const targets = targetComp ? [targetComp] : companies;
        const periodLabel = { today:'Hoje', yesterday:'Ontem', this_week:'Esta Semana', last_week:'Semana Passada', this_month:'Este Mês', last_month:'Mês Passado', this_year:'Este Ano' }[period] || 'Período';

        let report = '';
        for (const comp of targets) {
            // Carregar em paralelo só para esta filial
            const [allPaid, pendDesp, atrDesp, pendRec, atrRec] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, status: 'pago' }, '-payment_date', 200),
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

            // Top categorias despesas
            const catMap = {};
            despesas.forEach(t => { catMap[t.category||'Outros'] = (catMap[t.category||'Outros']||0) + t.amount; });
            const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,4)
                .map(([cat,v]) => `  └ ${cat}: ${brl(v)}`).join('\n');

            report += `🏢 *${comp.name}* — ${periodLabel}\n${'─'.repeat(28)}\n`;
            report += `💰 Receitas pagas: *${brl(totalR)}* (${receitas.length})\n`;
            report += `💸 Despesas pagas: *${brl(totalD)}* (${despesas.length})\n`;
            report += `📊 Resultado: ${resultado >= 0 ? '🟢' : '🔴'} *${brl(resultado)}*\n`;
            report += `🏦 Saldo em caixa: *${brl(saldo)}*\n\n`;
            report += `*Pendências:*\n`;
            report += `  💸 A pagar: ${brl(pendDesp.reduce((s,t)=>s+t.amount,0))} (${pendDesp.length}) | Atrasado: ${brl(atrDesp.reduce((s,t)=>s+t.amount,0))} (${atrDesp.length})\n`;
            report += `  💰 A receber: ${brl(pendRec.reduce((s,t)=>s+t.amount,0))} (${pendRec.length}) | Atrasado: ${brl(atrRec.reduce((s,t)=>s+t.amount,0))} (${atrRec.length})\n`;
            if (topCats) report += `\n*Top despesas:*\n${topCats}\n`;
            report += '\n';
        }
        return report.trim() || '📊 Sem dados para o período.';
    }

    // ── daily_report ──────────────────────────────────────────────────────────
    if (action === 'daily_report') {
        const reportDate = query.date || today();
        const range = { start: reportDate, end: reportDate };
        const targets = targetComp ? [targetComp] : (cid ? companies.filter(c=>c.id===cid) : companies);
        const fmtReportDate = reportDate.split('-').reverse().join('/');

        let report = `📋 *Relatório Diário — ${fmtReportDate}*\n\n`;

        for (const comp of targets) {
            const [entradas, saidas, pendDesp, pendRec] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pago' }, '-payment_date', 100),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pago' }, '-payment_date', 100),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }, 'due_date', 30),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }, 'due_date', 30),
            ]);

            const entradasDia = filterByDateRange(entradas, 'payment_date', range);
            const saidasDia = filterByDateRange(saidas, 'payment_date', range);
            const totalEntradas = entradasDia.reduce((s,t)=>s+t.amount,0);
            const totalSaidas = saidasDia.reduce((s,t)=>s+t.amount,0);
            const resultado = totalEntradas - totalSaidas;
            const compAccounts = accounts.filter(a=>a.company_id===comp.id);
            const saldoCaixa = compAccounts.reduce((s,a)=>s+(a.current_balance||0),0);

            // Vencendo hoje
            const hoje = today();
            const vencendoHoje = [...pendDesp,...pendRec].filter(t=>t.due_date===hoje);

            report += `🏢 *${comp.name}*\n${'─'.repeat(30)}\n`;

            // Entradas do dia
            if (entradasDia.length > 0) {
                report += `\n📥 *Entradas (${entradasDia.length}):*\n`;
                entradasDia.slice(0,6).forEach(t => {
                    report += `  ✅ ${t.description}\n     └ ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}${t.category?' | '+t.category:''}\n`;
                });
                if (entradasDia.length > 6) report += `  _(+${entradasDia.length-6} mais)_\n`;
                report += `  *Subtotal: ${brl(totalEntradas)}*\n`;
            } else {
                report += `\n📥 *Entradas:* nenhuma\n`;
            }

            // Saídas do dia
            if (saidasDia.length > 0) {
                report += `\n📤 *Saídas (${saidasDia.length}):*\n`;
                saidasDia.slice(0,6).forEach(t => {
                    report += `  ✅ ${t.description}\n     └ ${brl(t.amount)}${t.contact_name?' | '+t.contact_name:''}${t.category?' | '+t.category:''}\n`;
                });
                if (saidasDia.length > 6) report += `  _(+${saidasDia.length-6} mais)_\n`;
                report += `  *Subtotal: ${brl(totalSaidas)}*\n`;
            } else {
                report += `\n📤 *Saídas:* nenhuma\n`;
            }

            // Resultado
            report += `\n📊 *Resultado do dia:* ${resultado >= 0 ? '🟢' : '🔴'} ${brl(resultado)}\n`;
            report += `🏦 *Saldo em caixa:* ${brl(saldoCaixa)}\n`;

            // Alertas de vencimento hoje
            if (vencendoHoje.length > 0) {
                report += `\n⏰ *Vence hoje (${vencendoHoje.length}):*\n`;
                vencendoHoje.slice(0,4).forEach(t => {
                    const icon = t.type==='receita'?'📥':'📤';
                    report += `  ${icon} ${t.description} | ${brl(t.amount)}\n`;
                });
            }

            report += '\n';
        }

        return report.trim();
    }

    // ── search_transactions ───────────────────────────────────────────────────
    if (action === 'search_transactions') {
        const filter = {};
        if (cid) filter.company_id = cid;
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
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'pendente' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'atrasado' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'parcial' }, 'due_date', 30),
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

        if (!txs.length) return `🔍 Nenhuma transação encontrada${targetComp ? ` em *${targetComp.name}*` : ''}.`;

        const sIcon = { pago:'✅', pendente:'🟡', atrasado:'🔴', parcial:'🟠' };
        const lines = txs.slice(0, 25).map(t => {
            const comp = !cid ? companies.find(c => c.id === t.company_id) : null;
            const dateVal = t.status === 'pago' ? fmtDate(t.payment_date) : fmtDate(t.due_date);
            const datePfx = t.status === 'pago' ? 'pg' : 'venc';
            return `${sIcon[t.status]||'▪️'} *${t.description}*${comp ? ` [${comp.name}]` : ''}\n   └ ${brl(t.amount)} | ${t.type==='receita'?'📥':'📤'} ${datePfx} ${dateVal}${t.category?` | ${t.category}`:''}`;
        });

        const totalR = txs.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0);
        const totalD = txs.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0);
        const header = `📊 *${targetComp?targetComp.name+' — ':''}${txs.length} transação(ões)*`;
        const footer = totalR>0&&totalD>0 ? `📥 ${brl(totalR)} | 📤 ${brl(totalD)}` : `*Total: ${brl(totalR||totalD)}*`;
        return `${header}\n\n${lines.join('\n')}\n\n${footer}`;
    }

    // ── upcoming_bills ────────────────────────────────────────────────────────
    if (action === 'upcoming_bills') {
        const days = query.days || 7;
        const now = new Date();
        const limit = new Date(now); limit.setDate(now.getDate() + days);
        const range = { start: today(), end: limit.toISOString().split('T')[0] };

        const f = { status: 'pendente' };
        if (cid) f.company_id = cid;
        if (query.type && ['receita','despesa'].includes(query.type)) f.type = query.type;

        const [pend, atras] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter(f, 'due_date', 50),
            base44.asServiceRole.entities.Transaction.filter({ ...f, status: 'atrasado' }, 'due_date', 20),
        ]);

        const upcoming = filterByDateRange(pend, 'due_date', range);
        let msg = `📅 *Vencimentos — Próximos ${days} dias*${targetComp ? ` (${targetComp.name})` : ''}\n\n`;
        if (atras.length) {
            msg += `🔴 *Vencidos (${atras.length}):*\n`;
            atras.slice(0,8).forEach(t => msg += `  • ${t.description} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
            msg += '\n';
        }
        if (upcoming.length) {
            msg += `🟡 *A vencer (${upcoming.length}):*\n`;
            upcoming.forEach(t => msg += `  • ${t.description} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
        }
        if (!atras.length && !upcoming.length) msg += '✅ Nenhum vencimento próximo!';
        return msg.trim();
    }

    // ── add_transaction ───────────────────────────────────────────────────────
    if (action === 'add_transaction') {
        if (!cid) return '⚠️ Informe a filial antes de lançar.';
        let due = td.due_date || today();
        if (due.includes('/')) { const p = due.split('/'); due = `${p[2]}-${p[1]}-${p[0]}`; }
        const acct = accounts.find(a=>a.id===td.account_id) || accounts.find(a=>a.company_id===cid && a.type==='caixa') || accounts.find(a=>a.company_id===cid);
        const isPaid = td.is_paid === true || td.status === 'pago';
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
        return `✅ *${td.type==='receita'?'Receita':'Despesa'} lançada!*\n📝 ${td.description}\n💰 ${brl(td.amount)}\n📁 ${td.category||'Outras'}\n🏢 ${comp?.name||''}\n📅 Venc: ${fmtDate(due)}\n${isPaid?'✅ Pago':'🟡 Pendente'}`;
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
        const match = pending.find(t => (!term || t.description.toLowerCase().includes(term)) && (!pd.amount || Math.abs(t.amount - pd.amount) < t.amount * 0.3));
        if (!match) {
            const sug = pending.filter(t=>t.description.toLowerCase().includes(term.split(' ')[0])).slice(0,3)
                .map(t=>`  • ${t.description} | ${brl(t.amount)}`).join('\n');
            return `⚠️ Conta não encontrada: *"${pd.search_term}"*${sug?`\n\nSimilares:\n${sug}`:''}`;
        }
        await base44.asServiceRole.entities.Transaction.update(match.id, { status: 'pago', paid_amount: match.amount, payment_date: pd.payment_date || today() });
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
        if (cid) filter.company_id = cid;
        const all = await base44.asServiceRole.entities.Contact.filter(filter, 'name', 20);
        const term = (ai.search_term || '').toLowerCase();
        const found = term ? all.filter(c=>c.name.toLowerCase().includes(term)) : all.slice(0,10);
        if (!found.length) return '🔍 Nenhum contato encontrado.';
        return `👥 *Contatos (${found.length}):*\n` + found.map(c=>`  • *${c.name}* | ${c.type} | ${c.phone||'-'}`).join('\n');
    }

    return null; // reply padrão da IA
}

// ── Transcrever/analisar mídia ────────────────────────────────────────────────
async function processMedia(base44, mediaType, fileId, userText) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`getFile failed`);
    const dl = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`);
    const blob = new Blob([await dl.arrayBuffer()]);
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    if (mediaType === 'voice') {
        return await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: 'Transcreva este áudio em português. Responda APENAS com o texto transcrito.',
            file_urls: [file_url], model: 'gemini_3_flash'
        });
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
    console.log(`[v13] chat=${chat_id} type=${media_type} text="${user_text?.slice(0,80)}"`);

    // Processar mídia primeiro
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

    // Carregar sessão + dados base em paralelo
    const [sessionList, companies, accounts] = await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id }),
        base44.asServiceRole.entities.Company.filter({ is_active: true }),
        base44.asServiceRole.entities.FinancialAccount.filter({ is_active: true })
    ]);

    let session = sessionList[0];
    if (!session) session = await base44.asServiceRole.entities.TelegramChatSession.create({ chat_id, history: [] });

    // PHASE 1: Classificar intent (rápido, contexto mínimo)
    let ai;
    try {
        ai = await classifyIntent(base44, user_text, session, companies, accounts);
        if (!ai?.action) ai = { action: 'reply', reply: 'Não entendi. Pode reformular?' };
        console.log(`[v13] action=${ai.action} company=${ai.target_company||ai.query?.company_name||'-'}`);
    } catch (e) {
        console.error('[LLM]', e.message);
        await sendTelegram(chat_id, '😵‍💫 Erro na IA. Tente novamente.');
        await base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{});
        return Response.json({ status: 'llm_error' });
    }

    // Atualizar filial na sessão se IA identificou nova filial
    if (ai.target_company || ai.query?.company_name) {
        const newComp = resolveCompany(companies, ai.target_company || ai.query?.company_name);
        if (newComp && newComp.id !== session.selected_company_id && ai.action !== 'search_transactions') {
            // só muda filial se ação for select_company ou se não tiver filial ativa
            if (ai.action === 'select_company' || !session.selected_company_id) {
                await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: newComp.id });
                session.selected_company_id = newComp.id;
            }
        }
    }

    // PHASE 2: Executar ação (só carrega dados necessários)
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

    // Se reply ainda estiver vazio, gerar resposta contextual
    if (!finalReply) {
        try {
            const hist = (session.history || []).slice(-6).map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 200)}`).join('\n');
            finalReply = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `Você é FINAN, assistente financeiro de uma empresa de mineração de calcário. Responda em português do Brasil de forma concisa e útil.\n\n${hist ? `Histórico:\n${hist}\n\n` : ''}Usuário disse: "${user_text}"\n\nResponda diretamente.`
            });
        } catch(e) {
            console.error('[FALLBACK]', e.message);
            finalReply = 'Olá! Sou o FINAN, seu assistente financeiro. Como posso ajudar?';
        }
    }

    // Salvar histórico e enviar resposta em paralelo
    let hist = [...(session.history || [])];
    hist.push({ role: 'user', content: user_text.slice(0,300) });
    hist.push({ role: 'assistant', content: finalReply.slice(0,300) });
    if (hist.length > 20) hist = hist.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history: hist }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(()=>{})
    ]);

    return Response.json({ status: 'success', action: ai.action });
});