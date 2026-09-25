import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * Consulta dados públicos de um CNPJ (razão social, endereço, contato)
 * via OpenCNPJ (https://opencnpj.org) — API gratuita, sem token.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cnpj = String(body?.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      return Response.json({ error: 'CNPJ inválido: informe os 14 dígitos.' }, { status: 400 });
    }

    const res = await fetch(`https://api.opencnpj.org/${cnpj}`);
    if (!res.ok) {
      return Response.json({ found: false, error: 'CNPJ não encontrado na base pública.' }, { status: 404 });
    }
    const d = await res.json();
    if (!d || !d.cnpj || !d.razao_social) {
      return Response.json({ found: false, error: 'CNPJ não encontrado na base pública.' }, { status: 404 });
    }

    const tel = (d.telefones || []).find(t => !t.is_fax && t.numero);

    return Response.json({
      found: true,
      razao_social: d.razao_social || '',
      nome_fantasia: d.nome_fantasia || '',
      situacao_cadastral: d.situacao_cadastral || '',
      cep: d.cep ? String(d.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
      logradouro: [d.tipo_logradouro, d.logradouro].filter(Boolean).join(' '),
      numero: d.numero || '',
      bairro: d.bairro || '',
      municipio: d.municipio || '',
      uf: d.uf || '',
      email: (d.email || '').trim().toLowerCase(),
      phone: tel ? `(${tel.ddd}) ${tel.numero}` : ''
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}