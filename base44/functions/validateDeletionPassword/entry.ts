import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { company_id, password } = await req.json();
    if (!company_id || !password) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const pwds = await base44.asServiceRole.entities.DeletionPassword.filter({
      company_id,
      is_active: true,
    });

    if (!pwds.length) {
      return Response.json({ error: 'Nenhuma senha configurada para esta filial' }, { status: 400 });
    }

    if (String(password) !== String(pwds[0].password_hash)) {
      return Response.json({ error: 'Senha incorreta' }, { status: 401 });
    }

    return Response.json({ success: true, message: 'Autenticado' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
