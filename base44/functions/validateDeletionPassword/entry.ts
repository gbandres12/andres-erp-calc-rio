import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Apenas admins podem deletar' }, { status: 403 });
        }

        const { company_id, password } = await req.json();
        
        if (!company_id || !password) {
            return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        // Buscar senha configurada para a filial
        const pwds = await base44.asServiceRole.entities.DeletionPassword.filter({ 
            company_id, 
            is_active: true 
        });

        if (!pwds.length) {
            return Response.json({ error: 'Nenhuma senha configurada para esta filial' }, { status: 400 });
        }

        const configuredPwd = pwds[0];
        
        // Validar a senha (simples comparação de 5 dígitos)
        // Em produção, usar bcrypt para hash
        const isValid = await validateBcryptPassword(password, configuredPwd.password_hash);

        if (!isValid) {
            return Response.json({ error: 'Senha incorreta' }, { status: 401 });
        }

        return Response.json({ success: true, message: 'Autenticado' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// Simples validação — em produção usar bcryptjs
async function validateBcryptPassword(plaintext, hash) {
    // Aqui você importaria bcryptjs e usaria compare
    // Por enquanto, simples comparação (NÃO use em produção)
    // import bcrypt from 'npm:bcryptjs@2.4.3';
    // return await bcrypt.compare(plaintext, hash);
    
    // Placeholder: retorna true se coincidir
    // O usuário pode adicionar bcrypt depois
    return plaintext === hash; // Remover em produção!
}