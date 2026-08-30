import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ROLES = new Set(['admin', 'operator', 'scale_operator', 'custom']);

function isAppAdmin(user) {
  return Boolean(user && (user.custom_role === 'admin' || user.role === 'admin'));
}

async function invite(base44, email) {
  const svc = base44.asServiceRole;
  if (typeof svc?.auth?.inviteUser === 'function') {
    return svc.auth.inviteUser(email, 'user');
  }
  if (typeof svc?.users?.inviteUser === 'function') {
    return svc.users.inviteUser(email, 'user');
  }
  if (typeof base44.auth?.inviteUser === 'function') {
    return base44.auth.inviteUser(email, 'user');
  }
  if (typeof base44.users?.inviteUser === 'function') {
    return base44.users.inviteUser(email, 'user');
  }
  throw new Error('Convite não disponível neste SDK. Convide pelo painel Base44 e depois defina o perfil aqui.');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    if (!isAppAdmin(actor)) {
      return Response.json({ error: 'Apenas administradores do ERP podem convidar usuários' }, { status: 403 });
    }

    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const custom_role = body?.custom_role || 'operator';
    const allowed_companies = Array.isArray(body?.allowed_companies) ? body.allowed_companies.filter(Boolean) : [];
    const custom_permissions = Array.isArray(body?.custom_permissions) ? body.custom_permissions.filter(Boolean) : [];

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'E-mail inválido' }, { status: 400 });
    }
    if (!ROLES.has(custom_role)) {
      return Response.json({ error: 'Perfil inválido' }, { status: 400 });
    }
    if (custom_role !== 'admin' && allowed_companies.length === 0) {
      return Response.json({ error: 'Selecione ao menos uma filial' }, { status: 400 });
    }

    await invite(base44, email);

    let applied = false;
    try {
      const all = await base44.asServiceRole.entities.User.list('-created_date', 200);
      const created = (all || []).find((u) => String(u.email || '').toLowerCase() === email);
      if (created?.id) {
        await base44.asServiceRole.entities.User.update(created.id, {
          custom_role,
          allowed_companies,
          custom_permissions: custom_role === 'custom' ? custom_permissions : [],
        });
        applied = true;
      }
    } catch (_) {}

    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        user_email: actor.email,
        user_name: actor.full_name || actor.email,
        action: 'create',
        entity_type: 'User',
        details: `Convite enviado para ${email} (perfil ${custom_role}${applied ? ', perfil aplicado' : ', perfil pendente do 1º login'})
`,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      applied,
      message: applied
        ? 'Convite enviado e perfil aplicado.'
        : 'Convite enviado. Depois do primeiro login, abra Permissões e confirme o perfil.',
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Falha ao convidar' }, { status: 500 });
  }
});
