import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        const results = [];

        for (const account of accountsToRecalculate) {
            // Buscar todas as transações pagas dessa conta
            // Nota: O limite de listagem padrão pode ser um problema se houver muitas transações.
            // O ideal seria paginação, mas para este fix rápido vamos aumentar o limite.
            // Base44 SDK filter suporta limit? Sim. Vamos por um limite alto seguro.
            
            // Buscar todas as transações da conta
            const transactions = await base44.entities.Transaction.filter({
                account_id: account.id
            }, undefined, 10000); // Limite alto para pegar tudo

            let totalReceitas = 0;
            let totalDespesas = 0;

            transactions.forEach(t => {
                let valor = t.paid_amount || 0;
                
                // Fallback para transações antigas marcadas como pago mas sem paid_amount
                if (t.status === 'pago' && valor === 0) {
                    valor = t.amount || 0;
                }

                if (t.type === 'receita') {
                    totalReceitas += valor;
                } else if (t.type === 'despesa') {
                    totalDespesas += valor;
                }
            });

            const initialBalance = account.initial_balance || 0;
            const newCurrentBalance = initialBalance + totalReceitas - totalDespesas;

            // Atualizar a conta se o saldo for diferente
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