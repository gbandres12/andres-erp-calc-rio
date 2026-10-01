// exportMonthlyInvoices - ZIP com XMLs das notas autorizadas do mês + planilha resumo (CSV)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { zipSync, strToU8 } from 'npm:fflate@0.8.2';

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const num = (v: unknown) => Number(v || 0).toFixed(2).replace('.', ',');

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { company_id, month, preview } = await req.json();
    if (!company_id || !/^\d{4}-\d{2}$/.test(month || '')) {
      return Response.json({ error: 'company_id e month (AAAA-MM) obrigatórios' }, { status: 400 });
    }
    const isAdmin = user.role === 'admin' || user.custom_role === 'admin';
    if (!isAdmin && !(user.allowed_companies || []).includes(company_id)) {
      return Response.json({ error: 'Sem acesso a esta filial' }, { status: 403 });
    }

    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const dateRange = { $gte: start, $lt: end };

    const db = base44.asServiceRole.entities;
    const invoices = await db.FiscalInvoice.filter({ company_id, status: 'autorizada', issue_date: dateRange }, 'number', 1000);
    const cancelled = await db.FiscalInvoice.filter({ company_id, status: { $in: ['cancelada', 'inutilizada'] }, issue_date: dateRange }, 'number', 1000);

    if (preview) {
      return Response.json({ authorized: invoices.length, cancelled: cancelled.length, total: invoices.reduce((s, i) => s + Number(i.total || 0), 0) });
    }
    if (invoices.length === 0) return Response.json({ error: 'Nenhuma nota autorizada neste mês' }, { status: 404 });

    const configs = await db.FiscalConfig.filter({ company_id });
    const secretName = configs[0]?.notaas_secret_name || 'NOTAAS_PROJECT_KEY';
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return Response.json({ error: `Chave NotaAs não configurada (${secretName})` }, { status: 500 });

    const files: Record<string, Uint8Array> = {};
    const missing: string[] = [];
    const queue = [...invoices];
    const worker = async () => {
      while (queue.length) {
        const inv = queue.shift()!;
        const label = inv.number ? `NF ${inv.number}` : inv.reference;
        if (!inv.api_reference) { missing.push(label); continue; }
        const res = await fetch(`https://platform.notaas.com.br/api/v1/nfe/invoices/${inv.api_reference}/xml`, {
          headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(30000)
        }).catch(() => null);
        if (!res || !res.ok) { missing.push(label); continue; }
        const name = `${String(inv.number || 0).padStart(6, '0')}-${inv.api_access_key || inv.reference}.xml`;
        files[`xml/${name}`] = new Uint8Array(await res.arrayBuffer());
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));

    const header = ['Número', 'Série', 'Data', 'Destinatário', 'CPF/CNPJ', 'CFOP', 'Valor Total', 'ICMS', 'PIS', 'COFINS', 'Chave de Acesso', 'Protocolo', 'XML'];
    const rows = invoices.map((i) => [
      i.number, i.serie || '1', i.issue_date, i.recipient_name, i.recipient_cpf_cnpj,
      [...new Set((i.items || []).map((it) => it.cfop).filter(Boolean))].join('/'),
      num(i.total), num(i.icms_total), num(i.pis_total), num(i.cofins_total),
      i.api_access_key, i.api_protocol,
      missing.includes(i.number ? `NF ${i.number}` : i.reference) ? 'NÃO BAIXADO' : 'OK'
    ]);
    const totalRow = ['TOTAL', '', '', `${invoices.length} notas`, '', '', num(invoices.reduce((s, i) => s + Number(i.total || 0), 0)), '', '', '', '', '', ''];
    const cancelRows = cancelled.map((i) => [i.number, i.serie || '1', i.issue_date, i.recipient_name, i.recipient_cpf_cnpj, '', num(i.total), '', '', '', i.api_access_key, i.status.toUpperCase(), 'NÃO INCLUÍDA']);
    const lines = [header, ...rows, totalRow, ...(cancelRows.length ? [[], ['CANCELADAS / INUTILIZADAS (fora do pacote)'], ...cancelRows] : [])];
    files[`resumo-${month}.csv`] = strToU8('\uFEFF' + lines.map((r) => r.map(csvCell).join(';')).join('\r\n'));

    const companies = await db.Company.filter({ id: company_id });
    const code = companies[0]?.code || 'FILIAL';
    return Response.json({
      filename: `NOTAS-${code}-${month}.zip`,
      data: toBase64(zipSync(files)),
      included: invoices.length - missing.length,
      missing, cancelled: cancelled.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});