import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function handleNewQuoteRequest(req) {
    const base44 = createClientFromRequest(req);
    
    try {
        const payload = await req.json();
        // Estrutura do payload de automação de entidade:
        // { event: { type, entity_name, entity_id }, data: { ... } }
        
        const { event, data } = payload;
        
        if (!data || !data.requested_suppliers || data.requested_suppliers.length === 0) {
            console.log("No suppliers requested or no data.");
            return Response.json({ status: "skipped" });
        }

        const quoteRequest = data;
        const suppliers = await Promise.all(
            quoteRequest.requested_suppliers.map(id => base44.asServiceRole.entities.Contact.get(id))
        );

        // Criar registros de resposta pendente para cada fornecedor
        for (const supplier of suppliers) {
            if (!supplier) continue;

            // Verificar se já existe (para evitar duplicatas em updates)
            const existing = await base44.asServiceRole.entities.SupplierQuoteResponse.filter({
                quote_request_id: quoteRequest.id,
                supplier_id: supplier.id
            });

            if (existing.length === 0) {
                await base44.asServiceRole.entities.SupplierQuoteResponse.create({
                    quote_request_id: quoteRequest.id,
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    status: 'pendente',
                    company_id: quoteRequest.company_id
                });
            }

            // Enviar E-mail
            if (supplier.email) {
                const emailBody = `
Prezado fornecedor ${supplier.name},

Este é um contato automático do Sistema de Compras da ${quoteRequest.requester_name || "Andres Tech"}.
Não responda a este e-mail como se fosse uma pessoa. Sou um assistente virtual encarregado de coletar cotações.

SOLICITAÇÃO DE ORÇAMENTO #${quoteRequest.id.substring(0,8)}

Produto: ${quoteRequest.product_name}
Quantidade: ${quoteRequest.quantity}
Urgência: ${quoteRequest.urgency.toUpperCase()}
Observações: ${quoteRequest.notes || "Nenhuma"}

Por favor, responda a este e-mail com sua melhor proposta contendo:
- Preço unitário e total
- Prazo de entrega
- Condições de pagamento

Aguardamos seu retorno.

Atenciosamente,
Bot de Compras - Andres Tech
                `;

                await base44.integrations.Core.SendEmail({
                    to: supplier.email,
                    subject: `Cotação Automática: ${quoteRequest.product_name} (Req #${quoteRequest.id.substring(0,6)})`,
                    body: emailBody,
                    from_name: "Andres Tech Bot"
                });
                console.log(`Email sent to ${supplier.email}`);
            } else {
                console.log(`Supplier ${supplier.name} has no email.`);
            }
        }

        // Atualizar status da solicitação
        await base44.asServiceRole.entities.SupplierQuoteRequest.update(quoteRequest.id, {
            status: 'em_andamento'
        });

        return Response.json({ status: "success", suppliers_contacted: suppliers.length });

    } catch (error) {
        console.error("Error processing quote request:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

Deno.serve(handleNewQuoteRequest);