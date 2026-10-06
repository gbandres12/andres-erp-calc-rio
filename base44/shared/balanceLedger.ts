// Lógica compartilhada do caixa: cálculo do saldo esperado por conta
// (a partir do razão de lançamentos e pagamentos) e gravação do log
// de saldo (antes/depois). Usado por recalculateBalance e reconcileBalances.

export async function computeCompanyBalances(base44, companyId) {
    const transactions = await base44.entities.Transaction.filter({ company_id: companyId }, undefined, 10000);
    const txTypeMap = {};
    transactions.forEach(t => { txTypeMap[t.id] = t.type; });

    const payments = await base44.entities.TransactionPayment.filter({ company_id: companyId }, undefined, 10000);
    const transactionsWithPayments = new Set(payments.map(p => p.transaction_id));

    const byAccount = {};
    const addMovement = (accId, type, valor) => {
        if (!accId) return;
        if (!byAccount[accId]) byAccount[accId] = { receitas: 0, despesas: 0 };
        if (type === 'receita') byAccount[accId].receitas += valor;
        else if (type === 'despesa') byAccount[accId].despesas += valor;
    };

    // 1) Pagamentos granulares (transações com registros de pagamento)
    payments.forEach(p => {
        const type = txTypeMap[p.transaction_id];
        addMovement(p.account_id, type, Number(p.amount) || 0);
    });

    // 2) Fallback para transações sem registros de pagamento
    transactions.forEach(t => {
        if (transactionsWithPayments.has(t.id)) return;
        const valor = Number(t.paid_amount || (t.status === 'pago' ? t.amount : 0)) || 0;
        if (valor > 0) addMovement(t.account_id, t.type, valor);
    });

    return { byAccount, txCount: transactions.length, paymentCount: payments.length };
}

export function expectedBalanceFor(account, byAccount) {
    const stats = byAccount[account.id] || { receitas: 0, despesas: 0 };
    return (account.initial_balance || 0) + stats.receitas - stats.despesas;
}

export async function logBalanceChange(serviceClient, { companyId, account, before, after, userEmail, userName, operation, trigger, notes }) {
    try {
        await serviceClient.entities.BalanceLog.create({
            company_id: companyId,
            account_id: account.id,
            account_name: account.name,
            operation: operation || 'recalculo',
            balance_before: before || 0,
            balance_after: after || 0,
            difference: Math.round(((after || 0) - (before || 0)) * 100) / 100,
            trigger: trigger || 'automatico',
            user_email: userEmail || 'sistema',
            user_name: userName || '',
            notes: notes || ''
        });
    } catch (e) {
        console.error('Falha ao gravar log de saldo:', e.message);
    }
}