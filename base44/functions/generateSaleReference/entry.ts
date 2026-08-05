// generateSaleReference - Gera a próxima referência sequencial de venda POR FILIAL
// (evita duplicidade de numeração entre filiais)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        let company_id = null;
        try {
            const body = await req.json();
            company_id = body?.company_id || null;
        } catch (_) {
            // requisição sem body — tenta query string
        }
        if (!company_id) {
            const url = new URL(req.url);
            company_id = url.searchParams.get('company_id');
        }

        if (!company_id) {
            return Response.json({ error: 'company_id é obrigatório' }, { status: 400 });
        }

        // Busca apenas as vendas DA FILIAL para sequência por filial
        const sales = await base44.asServiceRole.entities.Sale.filter({ company_id }, '-created_date', 500);
        let maxNum = 0;
        sales.forEach(s => {
            const match = s.reference?.match(/^VENDA-(?:CBA-|MUC-|LDS-)?(\d+)$/i);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n > maxNum) maxNum = n;
            }
        });
        const nextRef = `VENDA-${String(maxNum + 1).padStart(6, '0')}`;
        return Response.json({ reference: nextRef, next_number: maxNum + 1, company_id });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});