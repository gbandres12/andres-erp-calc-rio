import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { computeCompanyBalances, expectedBalanceFor, logBalanceChange } from '../../shared/balanceLedger.ts';

// Serializa recálculos simultâneos por empresa: chamadas concorrentes
// esperam a anterior terminar antes de rodar, evitando saldos calculados
// com dados parcialmente gravados.
const locks = new Map();
async function withCompanyLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const task = prev.then(fn, fn);
    locks.set(key, task.catch(() => {}));
    return task;
}

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

        return withCompanyLock(`recalc:${company_id}`, async () => {

        // Se account_id for fornecido, recalcula só aquela conta.
        // Se não, recalcula todas as contas da empresa.
        let accountsToRecalculate = [];

        if (account_id) {
            const account = await base44.entities.FinancialAccount.get(account_id);
            if (account) accountsToRecalculate.push(account);
        } else {
            accountsToRecalculate = await base44.entities.FinancialAccount.filter({ company_id });
        }

        const { byAccount } = await computeCompanyBalances(base44, company_id);

        const results = [];

        for (const account of accountsToRecalculate) {
            const newCurrentBalance = Math.round(expectedBalanceFor(account, byAccount) * 100) / 100;
            const before = account.current_balance || 0;

            if (before !== newCurrentBalance) {
                await base44.entities.FinancialAccount.update(account.id, {
                    current_balance: newCurrentBalance
                });

                // Log de saldo: registra antes/depois, quem executou e o gatilho.
                await logBalanceChange(base44.asServiceRole, {
                    companyId: company_id,
                    account,
                    before,
                    after: newCurrentBalance,
                    userEmail: user.email,
                    userName: user.full_name,
                    operation: 'recalculo',
                    trigger: 'automatico',
                    notes: 'Recálculo do caixa a partir do razão de lançamentos e pagamentos'
                });

                results.push({
                    id: account.id,
                    name: account.name,
                    old: before,
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

        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});