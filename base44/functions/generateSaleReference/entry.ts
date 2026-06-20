// generateSaleReference - Gera a próxima referência sequencial de venda de forma segura
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        // Busca todas as vendas para encontrar o maior número sequencial global
        const allSales = await base44.asServiceRole.entities.Sale.list('-created_date', 1000);
        let maxNum = 0;
        allSales.forEach(s => {
            const match = s.reference?.match(/^VENDA-(\d+)$/);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n > maxNum) maxNum = n;
            }
        });
        const nextRef = `VENDA-${String(maxNum + 1).padStart(6, '0')}`;
        return Response.json({ reference: nextRef, next_number: maxNum + 1 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});