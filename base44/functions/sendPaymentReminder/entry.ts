import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { transactionId } = await req.json();

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch transaction
        const transaction = await base44.entities.Transaction.get(transactionId);
        if (!transaction) {
            return Response.json({ error: 'Transaction not found' }, { status: 404 });
        }

        // Fetch contact
        if (!transaction.contact_id) {
            return Response.json({ error: 'Transaction has no associated contact' }, { status: 400 });
        }
        const contact = await base44.entities.Contact.get(transaction.contact_id);
        if (!contact || !contact.email) {
            return Response.json({ error: 'Contact not found or has no email' }, { status: 400 });
        }

        // Format values
        const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount);
        const dueDate = new Date(transaction.due_date).toLocaleDateString('pt-BR');

        // Send Email
        await base44.integrations.Core.SendEmail({
            to: contact.email,
            subject: `Lembrete de Pagamento - ${transaction.description}`,
            body: `
                Olá ${contact.name},

                Este é um lembrete amigável sobre o pagamento pendente referente a:
                
                Descrição: ${transaction.description}
                Valor: ${amount}
                Vencimento: ${dueDate}

                Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.

                Atenciosamente,
                ${user.full_name || 'Financeiro'}
            `
        });

        return Response.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});