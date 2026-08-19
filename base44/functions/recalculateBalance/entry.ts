import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { account_id, company_id } = payload;

        if (!company_id) {
             return Response.json({ error: 'Company ID required' }, { status: 400 });
        }

        // Se account_id for fornecido, recalcula só aquela conta.
        // Se não, recalcula todas as contas da empresa.
        let accountsToRecalculate = [];

        if (account_id) {
            const account = await base44.entities.FinancialAccount.get(account_id);
            if (account) accountsToRecalculate.push(account);
        } else {
            accountsToRecalculate = await base44.entities.FinancialAccount.filter({ company_id });
        }

        // Mapa id -> type para classificar cada movimentação como receita/despesa
        const transactions = await base44.entities.Transaction.filter({ company_id }, undefined, 10000);
        const txTypeMap = {};
        transactions.forEach(t => { txTypeMap[t.id] = t.type; });

        // SOURCE OF TRUTH: TransactionPayment é o registro granular de cada
        // pagamento/abatimento, com o account_id e o amount CORRETOS de cada
        // movimentação. Usar Transaction.paid_amount + Transaction.account_id
        // desajusta o caixa quando há pagamentos parciais em contas diferentes
        // (o account_id é sobrescrito a cada pagamento e o paid_amount é
        // acumulado), atribuindo o valor total à última conta usada.
        const payments = await base44.entities.TransactionPayment.filter({ company_id }, undefined, 10000);
        const transactionsWithPayments = new Set(payments.map(p => p.transaction_id));

        // Acumular movimentações por conta
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

        // 2) Fallback para transações sem registros de pagamento (lançamentos
        //    antigos ou gerados por vendas/compras): contabiliza pelo paid_amount
        //    + account_id próprios. Não processa transações já cobertas pelo
        //    passo 1 para evitar duplicidade.
        transactions.forEach(t => {
            if (transactionsWithPayments.has(t.id)) return;
            const valor = Number(t.paid_amount || (t.status === 'pago' ? t.amount : 0)) || 0;
            if (valor > 0) addMovement(t.account_id, t.type, valor);
        });

        const results = [];

        for (const account of accountsToRecalculate) {
            const stats = byAccount[account.id] || { receitas: 0, despesas: 0 };
            const initialBalance = account.initial_balance || 0;
            const newCurrentBalance = initialBalance + stats.receitas - stats.despesas;

            if (account.current_balance !== newCurrentBalance) {
                await base44.entities.FinancialAccount.update(account.id, {
                    current_balance: newCurrentBalance
                });
                results.push({
                    id: account.id,
                    name: account.name,
                    old: account.current_balance,
                    new: newCurrentBalance,
                    updated: true
                });
            } else {
                results.push({
                    id: account.id,
                    name: account.name,
                    balance: newCurrentBalance,
                    updated: false
                });
            }
        }

        return Response.json({
            success: true,
            message: `Recalculated ${results.length} accounts`,
            results
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});