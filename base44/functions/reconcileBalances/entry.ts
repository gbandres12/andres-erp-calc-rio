import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { computeCompanyBalances, expectedBalanceFor } from '../../shared/balanceLedger.ts';

// Conciliação de caixa (somente leitura): compara o saldo gravado de cada
// conta com o saldo esperado pelo razão (saldo inicial + entradas - saídas).
// Não altera nenhum dado — apenas reporta divergências.

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (user.role !== 'admin' && user.custom_role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const payload = await req.json().catch(() => ({}));
        const { company_id } = payload;

        let companies = [];
        if (company_id) {
            const co = await base44.entities.Company.get(company_id);
            if (!co) {
                return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
            }
            companies = [co];
        } else {
            companies = await base44.entities.Company.filter({ is_active: true });
        }

        const results = [];

        for (const co of companies) {
            const accounts = await base44.entities.FinancialAccount.filter({ company_id: co.id });
            const { byAccount } = await computeCompanyBalances(base44, co.id);

            for (const acc of accounts) {
                if (acc.is_active === false) continue;
                const expected = Math.round(expectedBalanceFor(acc, byAccount) * 100) / 100;
                const stored = acc.current_balance || 0;
                const difference = Math.round((expected - stored) * 100) / 100;
                results.push({
                    company_id: co.id,
                    company_name: co.name,
                    account_id: acc.id,
                    account_name: acc.name,
                    stored,
                    expected,
                    difference,
                    ok: Math.abs(expected - stored) < 0.01
                });
            }
        }

        return Response.json({
            success: true,
            checked_at: new Date().toISOString(),
            results
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}