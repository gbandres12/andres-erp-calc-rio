import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function isAppAdmin(user) {
  return Boolean(user && (user.custom_role === 'admin' || user.role === 'admin'));
}

function sanitize(u) {
  return {
    id: u.id,
    full_name: u.full_name || '',
    email: u.email || '',
    role: u.role || 'user',
    custom_role: u.custom_role || '',
    allowed_companies: Array.isArray(u.allowed_companies) ? u.allowed_companies : [],
    custom_permissions: Array.isArray(u.custom_permissions) ? u.custom_permissions : [],
    created_date: u.created_date || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isAppAdmin(user)) {
      return Response.json({ error: 'Apenas administradores do ERP podem listar usuários' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.User.list('-created_date', 200);
    return Response.json({ users: (all || []).map(sanitize) });
  } catch (error) {
    return Response.json({ error: error.message || 'Falha ao listar usuários' }, { status: 500 });
  }
});
