import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ROLES = new Set(['admin', 'operator', 'scale_operator', 'custom']);

function isAppAdmin(user) {
  return Boolean(user && (user.custom_role === 'admin' || user.role === 'admin'));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    if (!isAppAdmin(actor)) {
      return Response.json({ error: 'Apenas administradores do ERP podem alterar acessos' }, { status: 403 });
    }

    const body = await req.json();
    const userId = body?.user_id;
    const custom_role = body?.custom_role;
    const allowed_companies = Array.isArray(body?.allowed_companies) ? body.allowed_companies.filter(Boolean) : [];
    const custom_permissions = Array.isArray(body?.custom_permissions) ? body.custom_permissions.filter(Boolean) : [];

    if (!userId) {
      return Response.json({ error: 'user_id é obrigatório' }, { status: 400 });
    }
    if (!ROLES.has(custom_role)) {
      return Response.json({ error: 'Perfil inválido' }, { status: 400 });
    }
    if (custom_role !== 'admin' && allowed_companies.length === 0) {
      return Response.json({ error: 'Selecione ao menos uma filial para este perfil' }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.User.get(userId);
    if (!target) {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const patch = {
      custom_role,
      allowed_companies,
      custom_permissions: custom_role === 'custom' ? custom_permissions : [],
    };

    await base44.asServiceRole.entities.User.update(userId, patch);

    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        user_email: actor.email,
        user_name: actor.full_name || actor.email,
        action: 'update',
        entity_type: 'User',
        entity_id: userId,
        details: `Acesso de ${target.email}: perfil=${custom_role}, filiais=${allowed_companies.length}, módulos=${patch.custom_permissions.length}`,
      });
    } catch (_) {}

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message || 'Falha ao atualizar acesso' }, { status: 500 });
  }
});
