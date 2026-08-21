import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const isAdmin = user.custom_role === 'admin' || user.role === 'admin';
        if (!user || !isAdmin) {
            return Response.json({ error: 'Apenas admins podem configurar a senha' }, { status: 403 });
        }

        const { company_id, password } = await req.json();

        if (!company_id) {
            return Response.json({ error: 'Filial não selecionada' }, { status: 400 });
        }

        if (!password || !/^\d{5}$/.test(password)) {
            return Response.json({ error: 'A senha deve ter exatamente 5 dígitos numéricos' }, { status: 400 });
        }

        // Buscar senha existente para a filial
        const existing = await base44.asServiceRole.entities.DeletionPassword.filter({
            company_id,
            is_active: true
        });

        if (existing.length > 0) {
            // Atualizar senha existente
            await base44.asServiceRole.entities.DeletionPassword.update(existing[0].id, {
                password_hash: password,
                last_modified_by: user.email
            });
        } else {
            // Criar nova senha
            await base44.asServiceRole.entities.DeletionPassword.create({
                company_id,
                password_hash: password,
                last_modified_by: user.email,
                is_active: true
            });
        }

        return Response.json({ success: true, message: 'Senha configurada com sucesso' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});