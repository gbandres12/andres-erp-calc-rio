import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Relatório de saldo do caixa por filial, enviado por Telegram.
// period: "morning" (abertura do dia + movimentações do dia anterior)
//         "evening" (fechamento do dia + movimentações do dia)
// dry_run: true -> monta o relatório e devolve o texto sem enviar.

const brl = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '-');
const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
};

// Transações pagas de um dia (mesmo critério do relatório diário do bot:
// payment_date, com fallback para due_date)
async function getDayTransactions(base44, companyId, day) {
  const pagas = await base44.asServiceRole.entities.Transaction.filter(
    { company_id: companyId, status: 'pago' },
    '-payment_date',
    500
  );
  return pagas.filter((t) => {
    const d = t.payment_date || t.due_date;
    return d && d.slice(0, 10) === day;
  });
}

function sumBy(list, type) {
  return list
    .filter((t) => t.type === type)
    .reduce((s, t) => s + (t.paid_amount || t.amount || 0), 0);
}

async function sendTelegram(chatId, text) {
  const token = secrets.get('TELEGRAM_BOT_TOKEN');
  // Quebra em blocos de 4000 chars (limite do Telegram)
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 4000) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf('\n', 4000);
    if (cut < 1000) cut = 4000;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  let ok = 0;
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    if (!res.ok) {
      const fallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk.replace(/[*_`]/g, '') }),
      });
      if (fallback.ok) ok++;
    } else {
      ok++;
    }
  }
  return ok;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const period = payload.period === 'morning' ? 'morning' : 'evening';
    const dryRun = Boolean(payload.dry_run);

    const todayStr = isoDay(0);
    const reportDate = period === 'morning' ? isoDay(-1) : todayStr;
    const isToday = period === 'evening';

    // Destinatários: todos os chats já registrados no bot
    const sessions = await base44.asServiceRole.entities.TelegramChatSession.list();
    const chatIds = [...new Set((sessions || []).map((s) => s.chat_id).filter(Boolean))];

    const companies = await base44.asServiceRole.entities.Company.filter({ is_active: true });

    let report = '';
    if (period === 'morning') {
      report += `☀️ *Saldo do Caixa — Abertura de ${fmtDate(todayStr)}*\n`;
      report += `_(movimentações de ${fmtDate(reportDate)})_\n\n`;
    } else {
      report += `🌙 *Fechamento do Caixa — ${fmtDate(todayStr)}*\n\n`;
    }

    let totalGeralE = 0;
    let totalGeralS = 0;

    for (const company of companies) {
      const accounts = await base44.asServiceRole.entities.FinancialAccount.filter({
        company_id: company.id,
        is_active: true,
      });
      const saldoAtual = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
      const accountNames = {};
      accounts.forEach((a) => { accountNames[a.id] = a.name; });

      const movimentos = await getDayTransactions(base44, company.id, reportDate);
      const entradas = movimentos
        .filter((t) => t.type === 'receita')
        .sort((a, b) => (a.description || '').localeCompare(b.description || '', 'pt-BR'));
      const saidas = movimentos
        .filter((t) => t.type === 'despesa')
        .sort((a, b) => (a.description || '').localeCompare(b.description || '', 'pt-BR'));

      const totalE = sumBy(movimentos, 'receita');
      const totalS = sumBy(movimentos, 'despesa');
      const resultado = totalE - totalS;

      let saldoFinal;
      if (isToday) {
        saldoFinal = saldoAtual;
      } else {
        // Fechamento de ontem = abertura de hoje: desconta as movimentações
        // que já entraram hoje antes das 07:50 (normalmente nenhuma)
        const hoje = await getDayTransactions(base44, company.id, todayStr);
        saldoFinal = saldoAtual - sumBy(hoje, 'receita') + sumBy(hoje, 'despesa');
      }
      const saldoInicial = saldoFinal - totalE + totalS;

      totalGeralE += totalE;
      totalGeralS += totalS;

      report += `🏢 *${company.name}*\n`;
      report += `🏦 Saldo Inicial: *${brl(saldoInicial)}* → Final: *${brl(saldoFinal)}*\n`;
      if (accounts.length > 0) {
        report += `Saldo por conta: ${accounts.map((a) => `${a.name}: ${brl(a.current_balance || 0)}`).join(' | ')}\n`;
      }
      report += '\n';

      if (entradas.length > 0) {
        report += `📥 *Entradas (${entradas.length}) — ${brl(totalE)}*\n`;
        entradas.forEach((t) => {
          const conta = accountNames[t.account_id] || '—';
          report += `  ✅ ${t.description} | ${conta} | *${brl(t.paid_amount || t.amount || 0)}*\n`;
        });
      } else {
        report += '📥 Entradas: nenhuma\n';
      }
      report += '\n';

      if (saidas.length > 0) {
        report += `📤 *Saídas (${saidas.length}) — ${brl(totalS)}*\n`;
        saidas.forEach((t) => {
          const conta = accountNames[t.account_id] || '—';
          report += `  📤 ${t.description} | ${conta} | *${brl(t.paid_amount || t.amount || 0)}*\n`;
        });
      } else {
        report += '📤 Saídas: nenhuma\n';
      }
      report += `\n📊 Resultado: ${resultado >= 0 ? '🟢' : '🔴'} *${brl(resultado)}*\n\n`;
    }

    if (companies.length > 1) {
      const resGeral = totalGeralE - totalGeralS;
      report += `${'─'.repeat(28)}\n`;
      report += '📊 *CONSOLIDADO*\n';
      report += `📥 Total entradas: *${brl(totalGeralE)}*\n`;
      report += `📤 Total saídas: *${brl(totalGeralS)}*\n`;
      report += `💼 Resultado caixa: ${resGeral >= 0 ? '🟢' : '🔴'} *${brl(resGeral)}*\n`;
    }

    if (chatIds.length === 0) {
      return Response.json({
        status: 'success',
        sent: 0,
        message: 'Nenhum chat registrado no bot — nada enviado.',
        report: report.trim(),
      });
    }

    if (dryRun) {
      return Response.json({
        status: 'success',
        sent: 0,
        chats: chatIds.length,
        period,
        report: report.trim(),
      });
    }

    let sent = 0;
    for (const chatId of chatIds) {
      const ok = await sendTelegram(chatId, report.trim());
      if (ok > 0) sent++;
    }

    return Response.json({ status: 'success', sent, chats: chatIds.length, period });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}