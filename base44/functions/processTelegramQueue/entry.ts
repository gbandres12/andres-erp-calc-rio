// processTelegramQueue v12 - Agente Financeiro Completo
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

// ── Telegram Helpers ──────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
        }).catch(() => {
            // fallback sem markdown
            fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: chunk.replace(/[*_`]/g, '') })
            });
        });
    }
}

function splitMessage(text, max = 4000) {
    if (text.length <= max) return [text];
    const parts = [];
    let i = 0;
    while (i < text.length) {
        parts.push(text.slice(i, i + max));
        i += max;
    }
    return parts;
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

// ── Formatadores ──────────────────────────────────────────────────────────────
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? (d.includes('-') ? d.split('-').reverse().join('/') : d) : '-';
const today = () => new Date().toISOString().split('T')[0];

function getDateRange(period) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    
    if (period === 'today') {
        return { start: fmt(now), end: fmt(now) };
    }
    if (period === 'yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return { start: fmt(y), end: fmt(y) };
    }
    if (period === 'this_week') {
        const day = now.getDay();
        const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return { start: fmt(mon), end: fmt(sun) };
    }
    if (period === 'last_week') {
        const day = now.getDay();
        const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return { start: fmt(mon), end: fmt(sun) };
    }
    if (period === 'this_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: fmt(start), end: fmt(end) };
    }
    if (period === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start: fmt(start), end: fmt(end) };
    }
    if (period === 'this_year') {
        return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    }
    return null;
}

// ── Resolver filial por nome ──────────────────────────────────────────────────
function resolveCompany(companies, nameOrId) {
    if (!nameOrId) return null;
    return companies.find(c => c.id === nameOrId) ||
           companies.find(c => c.name.toLowerCase() === nameOrId.toLowerCase()) ||
           companies.find(c => c.name.toLowerCase().includes(nameOrId.toLowerCase())) ||
           null;
}

// ── Carregar contexto financeiro ──────────────────────────────────────────────
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
        ctx += `\n--- ${comp.name} (ID: ${comp.id}) ---
  Saldo Total: ${brl(bal)}
  💸 A Pagar Atrasado: ${brl(pl.reduce((s,t)=>s+t.amount,0))} (${pl.length} contas)
  💸 A Pagar Pendente: ${brl(pp.reduce((s,t)=>s+t.amount,0))} (${pp.length} contas)
  💰 A Receber Atrasado: ${brl(rl.reduce((s,t)=>s+t.amount,0))} (${rl.length} contas)
  💰 A Receber Pendente: ${brl(rp.reduce((s,t)=>s+t.amount,0))} (${rp.length} contas)
  Top Atrasadas:\n${topLate}`;
    }
    return ctx || 'Sem dados.';
}

// ── Buscar transações com filtro de data ──────────────────────────────────────
async function fetchTransactions(base44, filter, dateField, dateRange, limit = 100) {
    let txs = await base44.asServiceRole.entities.Transaction.filter(filter, `-${dateField}`, limit);
    if (dateRange) {
        txs = txs.filter(t => {
            const d = t[dateField];
            if (!d) return false;
            return d >= dateRange.start && d <= dateRange.end;
        });
    }
    return txs;
}

// ── Executar ações ────────────────────────────────────────────────────────────
async function executeAction(base44, action, response, companies, accounts, session, chatId) {
    const cid = resolveCompany(companies, response.target_company)?.id ||
                session.selected_company_id;

    // Atualizar filial na sessão se mudou
    if (response.target_company) {
        const nc = resolveCompany(companies, response.target_company);
        if (nc && nc.id !== session.selected_company_id) {
            await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
            session.selected_company_id = nc.id;
        }
    }

    // ── Selecionar filial ─────────────────────────────────────────────────────
    if (action === 'select_company') {
        const nc = resolveCompany(companies, response.target_company);
        if (!nc) return `⚠️ Filial não encontrada: "${response.target_company}"`;
        await base44.asServiceRole.entities.TelegramChatSession.update(session.id, { selected_company_id: nc.id });
        session.selected_company_id = nc.id;
        return `✅ *Filial selecionada: ${nc.name}*\nAgora posso responder perguntas específicas desta filial.`;
    }

    // ── Resumo financeiro completo ────────────────────────────────────────────
    if (action === 'financial_summary') {
        const q = response.query || {};
        const companyHint = q.company_name || response.target_company;
        const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
        const searchCid = targetComp?.id || cid;
        const period = q.period || 'this_month';
        const dateRange = getDateRange(period) || { start: q.start_date, end: q.end_date };

        const targets = searchCid 
            ? companies.filter(c => c.id === searchCid)
            : companies;

        let fullReport = '';
        for (const comp of targets) {
            const [pagos, pendDespesa, atrDespesa, pendReceita, atrReceita] = await Promise.all([
                fetchTransactions(base44, { company_id: comp.id, status: 'pago' }, 'payment_date', dateRange, 200),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'despesa', status: 'atrasado' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'pendente' }),
                base44.asServiceRole.entities.Transaction.filter({ company_id: comp.id, type: 'receita', status: 'atrasado' }),
            ]);

            const receitas = pagos.filter(t => t.type === 'receita');
            const despesas = pagos.filter(t => t.type === 'despesa');
            const totalReceitas = receitas.reduce((s, t) => s + t.amount, 0);
            const totalDespesas = despesas.reduce((s, t) => s + t.amount, 0);
            const saldo = totalReceitas - totalDespesas;
            const bal = accounts.filter(a => a.company_id === comp.id).reduce((s, a) => s + (a.current_balance || 0), 0);

            const periodLabel = {
                today: 'Hoje', yesterday: 'Ontem', this_week: 'Esta Semana',
                last_week: 'Semana Passada', this_month: 'Este Mês',
                last_month: 'Mês Passado', this_year: 'Este Ano'
            }[period] || (dateRange ? `${fmtDate(dateRange.start)} a ${fmtDate(dateRange.end)}` : 'Período');

            // Top categorias de despesa
            const catMap = {};
            despesas.forEach(t => { catMap[t.category || 'Outros'] = (catMap[t.category || 'Outros'] || 0) + t.amount; });
            const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
                .map(([cat, val]) => `  └ ${cat}: ${brl(val)}`).join('\n');

            fullReport += `\n🏢 *${comp.name}* — ${periodLabel}\n`;
            fullReport += `${'─'.repeat(30)}\n`;
            fullReport += `💰 *Receitas pagas:* ${brl(totalReceitas)} (${receitas.length})\n`;
            fullReport += `💸 *Despesas pagas:* ${brl(totalDespesas)} (${despesas.length})\n`;
            fullReport += `📊 *Resultado:* ${saldo >= 0 ? '🟢' : '🔴'} ${brl(saldo)}\n`;
            fullReport += `🏦 *Saldo em caixa:* ${brl(bal)}\n\n`;
            fullReport += `*Pendências:*\n`;
            fullReport += `  💸 A pagar: ${brl(pendDespesa.reduce((s,t)=>s+t.amount,0))} (${pendDespesa.length})\n`;
            fullReport += `  💸 Atrasado: ${brl(atrDespesa.reduce((s,t)=>s+t.amount,0))} (${atrDespesa.length})\n`;
            fullReport += `  💰 A receber: ${brl(pendReceita.reduce((s,t)=>s+t.amount,0))} (${pendReceita.length})\n`;
            fullReport += `  💰 Atrasado: ${brl(atrReceita.reduce((s,t)=>s+t.amount,0))} (${atrReceita.length})\n`;
            if (topCats) fullReport += `\n*Top despesas por categoria:*\n${topCats}\n`;
        }

        return fullReport.trim() || '📊 Sem dados para o período informado.';
    }

    // ── Consultar saldo ───────────────────────────────────────────────────────
    if (action === 'check_balance') {
        const companyHint = response.query?.company_name || response.target_company;
        const targets = companyHint
            ? companies.filter(c => resolveCompany([c], companyHint))
            : companies;

        let lines = '🏦 *Saldos das Contas*\n\n';
        for (const comp of targets) {
            const compAccounts = accounts.filter(a => a.company_id === comp.id);
            if (!compAccounts.length) continue;
            lines += `*${comp.name}*\n`;
            compAccounts.forEach(a => {
                const icon = a.current_balance >= 0 ? '🟢' : '🔴';
                lines += `  ${icon} ${a.name}: ${brl(a.current_balance)}\n`;
            });
            const total = compAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);
            lines += `  📊 Total: *${brl(total)}*\n\n`;
        }
        return lines.trim();
    }

    // ── Buscar transações ─────────────────────────────────────────────────────
    if (action === 'search_transactions') {
        const q = response.query || {};
        console.log('[SEARCH] query from LLM:', JSON.stringify(q));

        const companyHint = q.company_name || response.target_company;
        const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
        const searchCid = targetComp?.id || cid;

        const baseFilter = {};
        if (searchCid) baseFilter.company_id = searchCid;
        if (q.type && ['receita', 'despesa'].includes(q.type)) baseFilter.type = q.type;
        if (q.category) baseFilter.category = q.category;
        if (q.contact_name) baseFilter.contact_name = { $regex: q.contact_name, $options: 'i' };

        // Resolver período
        const dateRange = q.period ? getDateRange(q.period) : 
                         (q.start_date || q.end_date) ? { start: q.start_date, end: q.end_date } :
                         q.payment_date ? { start: q.payment_date, end: q.payment_date } :
                         q.due_date ? { start: q.due_date, end: q.due_date } : null;

        console.log('[SEARCH] baseFilter:', JSON.stringify(baseFilter), 'status:', q.status, 'dateRange:', JSON.stringify(dateRange));

        let txs = [];
        const dateField = (q.status === 'pago') ? 'payment_date' : 'due_date';

        if (!q.status || q.status === 'all') {
            txs = await fetchTransactions(base44, baseFilter, 'payment_date', dateRange, 100);
        } else if (q.status === 'aberto') {
            const [pend, atras, parc] = await Promise.all([
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'pendente' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'atrasado' }, 'due_date', 50),
                base44.asServiceRole.entities.Transaction.filter({ ...baseFilter, status: 'parcial' }, 'due_date', 50),
            ]);
            txs = [...pend, ...atras, ...parc].sort((a, b) => (a.due_date||'').localeCompare(b.due_date||''));
            if (dateRange) txs = txs.filter(t => t.due_date && t.due_date >= dateRange.start && t.due_date <= dateRange.end);
        } else {
            txs = await fetchTransactions(base44, { ...baseFilter, status: q.status }, dateField, dateRange, 100);
        }

        // Filtro por description (keyword)
        if (q.keyword) {
            const kw = q.keyword.toLowerCase();
            txs = txs.filter(t => t.description?.toLowerCase().includes(kw) || t.category?.toLowerCase().includes(kw) || t.contact_name?.toLowerCase().includes(kw));
        }

        console.log('[SEARCH] txs found:', txs.length);
        if (!txs.length) return `🔍 Nenhuma transação encontrada${targetComp ? ` em *${targetComp.name}*` : ''}.`;

        const sIcon = { pago: '✅', pendente: '🟡', atrasado: '🔴', parcial: '🟠' };
        const lines = txs.slice(0, 30).map(t => {
            const comp = companies.find(c => c.id === t.company_id);
            const dateLabel = t.status === 'pago' ? fmtDate(t.payment_date) : fmtDate(t.due_date);
            const datePrefix = t.status === 'pago' ? 'pg' : 'venc';
            const compTag = !searchCid && comp ? ` [${comp.name}]` : '';
            return `${sIcon[t.status] || '▪️'} *${t.description}*${compTag}\n   └ ${brl(t.amount)} | ${t.type === 'receita' ? '📥' : '📤'} | ${datePrefix} ${dateLabel}${t.category ? ` | ${t.category}` : ''}`;
        });

        const total = txs.reduce((s, t) => s + t.amount, 0);
        const totalR = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
        const totalD = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
        const header = `📊 *${targetComp ? targetComp.name + ' — ' : ''}${txs.length} transações*${txs.length > 30 ? ' (mostrando 30)' : ''}`;

        let summary = `*Total: ${brl(total)}*`;
        if (totalR > 0 && totalD > 0) summary = `📥 ${brl(totalR)} receitas | 📤 ${brl(totalD)} despesas`;

        return `${header}\n\n${lines.join('\n')}\n\n${summary}`;
    }

    // ── Lançar transação ──────────────────────────────────────────────────────
    if (action === 'add_transaction') {
        const d = response.transaction || {};
        if (!cid) return '⚠️ Informe a filial para registrar o lançamento.';
        let due = d.due_date || today();
        if (due.includes('/')) { const p = due.split('/'); due = `${p[2]}-${p[1]}-${p[0]}`; }
        const acct = accounts.find(a => a.id === d.account_id) ||
                     accounts.find(a => a.company_id === cid && a.type === 'caixa') ||
                     accounts.find(a => a.company_id === cid);
        const isPaid = d.is_paid !== false && (d.status === 'pago' || d.is_paid === true);
        await base44.asServiceRole.entities.Transaction.create({
            description: d.description || 'Lançamento via Bot',
            amount: Number(d.amount),
            original_amount: Number(d.amount),
            type: d.type || 'despesa',
            category: d.category || (d.type === 'receita' ? 'Outras Receitas' : 'Outras Despesas'),
            status: isPaid ? 'pago' : 'pendente',
            paid_amount: isPaid ? Number(d.amount) : 0,
            due_date: due,
            payment_date: isPaid ? (d.payment_date || today()) : null,
            account_id: acct?.id || null,
            company_id: cid,
            contact_name: d.contact_name || null,
            notes: 'Via TelegramBot'
        });
        const comp = companies.find(c => c.id === cid);
        return `✅ *${d.type === 'receita' ? 'Receita' : 'Despesa'} lançada!*\n📝 ${d.description}\n💰 ${brl(d.amount)}\n📁 ${d.category || 'Outras'}\n🏢 ${comp?.name || ''}\n📅 Venc: ${fmtDate(due)}\n${isPaid ? '✅ Pago' : '🟡 Pendente'}`;
    }

    // ── Dar baixa em conta ────────────────────────────────────────────────────
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
            const amtMatch = !pd.amount || Math.abs(t.amount - pd.amount) < t.amount * 0.25;
            return nameMatch && amtMatch;
        });
        if (!match) {
            const suggestions = pending.filter(t => t.description.toLowerCase().includes(term.split(' ')[0])).slice(0, 3)
                .map(t => `  • ${t.description} | ${brl(t.amount)}`).join('\n');
            return `⚠️ Conta não encontrada: *"${pd.search_term || ''}"*${suggestions ? `\n\nContas similares:\n${suggestions}` : ''}`;
        }
        await base44.asServiceRole.entities.Transaction.update(match.id, {
            status: 'pago',
            paid_amount: match.amount,
            payment_date: pd.payment_date || today(),
            notes: (match.notes || '') + '\nBaixa via TelegramBot'
        });
        return `✅ *Baixa realizada!*\n📝 ${match.description}\n💰 ${brl(match.amount)}\n📅 ${fmtDate(pd.payment_date || today())}`;
    }

    // ── Cadastrar contato ─────────────────────────────────────────────────────
    if (action === 'create_contact') {
        if (!cid) return '⚠️ Informe a filial.';
        const cd = { ...response.contact, company_id: cid, type: response.contact?.type || 'cliente' };
        const ex = (await base44.asServiceRole.entities.Contact.filter({ company_id: cid })
            ).find(c => c.name.toLowerCase().includes((cd.name || '').toLowerCase()));
        if (ex) return `⚠️ *Contato já existe:* ${ex.name}`;
        const nc = await base44.asServiceRole.entities.Contact.create(cd);
        return `✅ *Cadastrado!*\n👤 ${nc.name}\n📞 ${nc.phone || '-'}\n📧 ${nc.email || '-'}`;
    }

    // ── Buscar contatos ───────────────────────────────────────────────────────
    if (action === 'search_contacts') {
        const term = (response.search_term || '').toLowerCase();
        const all = await base44.asServiceRole.entities.Contact.filter({ company_id: cid || undefined });
        const found = all.filter(c => !term || c.name.toLowerCase().includes(term)).slice(0, 10);
        if (!found.length) return `🔍 Nenhum contato encontrado.`;
        return `👥 *Contatos encontrados:*\n` + found.map(c => `  • *${c.name}* | ${c.type} | ${c.phone || '-'}`).join('\n');
    }

    // ── Buscar produtos ───────────────────────────────────────────────────────
    if (action === 'search_products') {
        const filter = { is_active: true };
        if (cid) filter.company_id = cid;
        if (response.search_term) filter.name = { $regex: response.search_term, $options: 'i' };
        const prods = await base44.asServiceRole.entities.Product.filter(filter, '-name', 10);
        if (!prods.length) return '📦 Nenhum produto encontrado.';
        return `📦 *Produtos:*\n` + prods.map(p => `  ▫️ *${p.name}* | Venda: ${brl(p.sale_price)} | Estoque: ${p.current_stock} ${p.unit}`).join('\n');
    }

    // ── Listar vencimentos próximos ───────────────────────────────────────────
    if (action === 'upcoming_bills') {
        const q = response.query || {};
        const companyHint = q.company_name || response.target_company;
        const targetComp = companyHint ? resolveCompany(companies, companyHint) : null;
        const searchCid = targetComp?.id || cid;
        const days = q.days || 7;
        
        const nowDate = new Date();
        const limitDate = new Date(); limitDate.setDate(nowDate.getDate() + days);
        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const dateRange = { start: fmt(nowDate), end: fmt(limitDate) };

        const filter = { status: 'pendente' };
        if (searchCid) filter.company_id = searchCid;
        if (q.type && ['receita', 'despesa'].includes(q.type)) filter.type = q.type;

        const [pend, atras] = await Promise.all([
            base44.asServiceRole.entities.Transaction.filter(filter, 'due_date', 50),
            base44.asServiceRole.entities.Transaction.filter({ ...filter, status: 'atrasado' }, 'due_date', 20),
        ]);
        
        const upcoming = pend.filter(t => t.due_date >= dateRange.start && t.due_date <= dateRange.end);
        const overdue = atras.slice(0, 10);

        let msg = `📅 *Vencimentos — Próximos ${days} dias*${targetComp ? ` (${targetComp.name})` : ''}\n\n`;
        
        if (overdue.length) {
            msg += `🔴 *Vencidos:*\n`;
            overdue.forEach(t => msg += `  • ${t.description} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
            msg += '\n';
        }
        if (upcoming.length) {
            msg += `🟡 *A vencer:*\n`;
            upcoming.forEach(t => msg += `  • ${t.description} | ${brl(t.amount)} | ${fmtDate(t.due_date)}\n`);
        }
        if (!overdue.length && !upcoming.length) msg += '✅ Nenhum vencimento próximo!';
        
        return msg.trim();
    }

    // ── Gráfico ───────────────────────────────────────────────────────────────
    if (action === 'generate_chart') {
        const cd = response.chart || {};
        const cfg = {
            type: cd.type || 'bar',
            data: {
                labels: cd.labels || [],
                datasets: (cd.datasets || []).map((ds, i) => ({
                    label: ds.label, data: ds.data,
                    backgroundColor: i === 0 ? 'rgba(54,162,235,0.6)' : 'rgba(255,99,132,0.6)',
                    borderColor: i === 0 ? 'rgba(54,162,235,1)' : 'rgba(255,99,132,1)',
                    borderWidth: 1
                }))
            },
            options: { plugins: { title: { display: !!cd.title, text: cd.title || '' } }, scales: { y: { beginAtZero: true } } }
        };
        await sendPhoto(chatId, `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=600&height=350&backgroundColor=white`, cd.title || 'Gráfico');
        return response.reply || 'Gráfico enviado 👆';
    }

    return null;
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

    console.log(`[v12] chat=${chat_id} type=${media_type} text="${user_text?.slice(0, 80)}"`);

    // ── Processar mídia ───────────────────────────────────────────────────────
    if ((media_type === 'voice' && voice_file_id) || (media_type === 'photo' && photo_file_id)) {
        const isVoice = media_type === 'voice';
        await sendAction(chat_id, isVoice ? 'record_voice' : 'upload_photo');
        try {
            const fileId = isVoice ? voice_file_id : photo_file_id;
            const url = await uploadTelegramFile(base44, fileId);
            const prompt = isVoice
                ? 'Transcreva este áudio em português brasileiro. Responda APENAS com o texto transcrito, sem pontuação extra.'
                : 'Analise esta imagem. Se for comprovante/nota fiscal, extraia: valor total, data, fornecedor/empresa, descrição do item/serviço. Seja objetivo e conciso.';
            const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, file_urls: [url] });
            if (isVoice) {
                user_text = result;
                await sendTelegram(chat_id, `🎤 *Ouvi:* "${user_text}"`);
            } else {
                const cap = user_text && user_text !== '[Photo Message]' ? `Legenda: ${user_text}\n` : '';
                user_text = `${cap}[Imagem analisada]: ${result}`;
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
    const todayStr = today();
    const nowDate = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const financialCtx = await loadFinancialContext(base44, companies, accounts, cid);

    const history = (session.history || []).slice(-10).map(m =>
        `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 200)}`
    ).join('\n');

    // ── Prompt do Agente ──────────────────────────────────────────────────────
    const prompt = `Você é FINAN, um assistente financeiro inteligente e completo para uma empresa de mineração de calcário com 3 filiais.
Hoje é ${nowDate} (${todayStr}).

═══ FILIAIS ═══
${companies.map(c => `• ${c.name} → ID: ${c.id}`).join('\n')}

FILIAL ATIVA: ${activeName} (ID: ${cid || 'nenhuma'})

═══ SITUAÇÃO FINANCEIRA ATUAL ═══
${financialCtx}

═══ CONTAS BANCÁRIAS ═══
${accounts.map(a => `• ${a.name} | ${companies.find(c=>c.id===a.company_id)?.name||'?'} | Saldo: ${brl(a.current_balance)}`).join('\n') || '(nenhuma)'}

${history ? `═══ HISTÓRICO RECENTE ═══\n${history}\n` : ''}
═══ MENSAGEM DO USUÁRIO ═══
${user_text}

═══ INSTRUÇÕES DE RESPOSTA ═══
Responda SEMPRE em JSON com os campos obrigatórios: action e reply.

AÇÕES DISPONÍVEIS:

1. **reply** — Resposta informativa simples. Use quando não há ação específica.

2. **financial_summary** — Resumo financeiro completo com receitas, despesas e resultado.
   query: { company_name, period }
   Períodos válidos: "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year"
   Triggers: "resumo", "relatório", "balanço", "como está", "situação financeira", "resultado do mês"

3. **check_balance** — Consultar saldo das contas bancárias.
   query: { company_name }
   Triggers: "saldo", "quanto tem na conta", "saldo bancário"

4. **search_transactions** — Buscar lançamentos/transações.
   query: { type, status, company_name, period, start_date, end_date, keyword, category }
   - type: SOMENTE "receita" ou "despesa" (NUNCA outro valor!)
   - status: "pago", "pendente", "atrasado", "parcial", "aberto" (pendente+atrasado+parcial)
   - period: "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year"
   - "movimentações", "lançamentos", "fluxo de caixa", "o que foi pago/recebido" → status="pago"
   - "contas a pagar", "pendências" → status="aberto", type="despesa"
   - "contas a receber" → status="aberto", type="receita"

5. **upcoming_bills** — Vencimentos próximos.
   query: { company_name, days, type }
   Triggers: "vencer", "vencimentos", "próximas contas"

6. **add_transaction** — Lançar nova receita ou despesa.
   transaction: { description, amount, type, category, due_date, payment_date, is_paid, contact_name }
   Triggers: "lançar", "registrar", "paguei", "recebi", "adicionar conta"

7. **pay_bill** — Dar baixa em conta existente.
   payment: { search_term, amount, payment_date }
   Triggers: "dar baixa", "quitar", "pagar conta de"

8. **select_company** — Selecionar filial ativa.
   target_company: nome da filial
   Triggers: "mudar para", "trabalhar com", "selecionar filial"

9. **create_contact** — Cadastrar cliente ou fornecedor.
   contact: { name, phone, email, type, document }

10. **search_contacts** — Buscar contatos.
    search_term: nome do contato

11. **search_products** — Buscar produtos.
    search_term: nome do produto

12. **generate_chart** — Gerar gráfico visual.
    chart: { type, title, labels, datasets }
    Triggers: "gráfico", "visualizar", "comparar em gráfico"

REGRAS IMPORTANTES:
- Se mencionou filial por nome → coloque em query.company_name ou target_company
- Se mencionou "todas as filiais" ou "geral" → não preencha company_name
- Seja direto, use emojis, formate valores como "R$ X.XXX,XX"
- Se não entender a solicitação, peça esclarecimento com action="reply"
- Sempre confirme ações de criação/alteração antes de executar (a menos que já seja claro)
- Para perguntas sobre o sistema, explique as capacidades disponíveis`;

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
        if (!aiResponse) throw new Error('Resposta vazia da IA');
        if (!aiResponse.action) aiResponse.action = 'reply';
        console.log(`[v12] action=${aiResponse.action} target=${aiResponse.target_company || '-'}`);
    } catch (e) {
        console.error('[LLM]', e.message);
        await sendTelegram(chat_id, '😵‍💫 Erro na IA. Tente novamente em alguns instantes.');
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
            finalReply = `⚠️ Erro ao executar ação: ${e.message}`;
        }
    }

    // ── Salvar histórico e responder ──────────────────────────────────────────
    let hist = [...(session.history || [])];
    hist.push({ role: 'user', content: user_text });
    hist.push({ role: 'assistant', content: finalReply.slice(0, 500) });
    if (hist.length > 20) hist = hist.slice(-20);

    await Promise.all([
        base44.asServiceRole.entities.TelegramChatSession.update(session.id, { history: hist }),
        sendTelegram(chat_id, finalReply),
        base44.asServiceRole.entities.TelegramMessageQueue.delete(queueId).catch(() => {})
    ]);

    return Response.json({ status: 'success', action: aiResponse.action });
});