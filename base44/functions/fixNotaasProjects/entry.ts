import { createClientFromRequest } from 'npm:@base44/sdk@0.8.63';
import { secrets } from 'base44:runtime';

const API = 'https://platform.notaas.com.br/api/v1';
const LIMIT = 60;

// Abrevia a razão social mantendo palavras inteiras até o limite da NF-e (60)
function shorten(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= LIMIT) return text;
  const words = text.split(' ');
  let out = '';
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > LIMIT) break;
    out = next;
  }
  return out || text.slice(0, LIMIT);
}

async function orgFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { ok: res.ok, status: res.status, data };
}

function projectList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.projects)) return data.projects;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && user.custom_role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const token = secrets.get('NOTAAS_ORG_TOKEN');
    if (!token) return Response.json({ error: 'Segredo NOTAAS_ORG_TOKEN não configurado' }, { status: 500 });

    const list = await orgFetch('/org/projects', token);
    if (!list.ok) {
      return Response.json({ error: 'Falha ao listar projetos na NotaAs', status: list.status, details: list.data }, { status: 502 });
    }

    const projects = projectList(list.data);
    const results: any[] = [];
    for (const project of projects) {
      const current = String(project.razaoSocial || project.razao_social || '');
      if (!current || current.length <= LIMIT) {
        results.push({ id: project.id, name: project.name || project.nome || null, razaoSocial: current, action: 'sem_alteracao' });
        continue;
      }
      const fixed = shorten(current);
      const patch = await orgFetch(`/org/projects/${project.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ razaoSocial: fixed })
      });
      results.push({
        id: project.id,
        name: project.name || project.nome || null,
        before: current,
        after: fixed,
        action: patch.ok ? 'corrigido' : 'erro',
        status: patch.status,
        details: patch.ok ? undefined : patch.data
      });
    }

    return Response.json({ total: projects.length, results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}