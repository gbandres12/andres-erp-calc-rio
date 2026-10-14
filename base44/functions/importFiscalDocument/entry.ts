import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ---- helpers de parse XML NF-e (sem parser externo: regex nos blocos padrão) ----
const txt = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1].trim() : "";
};
const num = (s) => {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const itemSchema = {
  type: "object",
  properties: {
    codigo: { type: "string" }, descricao: { type: "string" }, ncm: { type: "string" },
    cfop: { type: "string" }, cst_csosn: { type: "string" }, unidade: { type: "string" },
    quantidade: { type: "number" }, valor_unitario: { type: "number" },
    desconto: { type: "number" }, total: { type: "number" }
  }
};

const LLM_SCHEMA = {
  type: "object",
  properties: {
    numero: { type: "string" }, serie: { type: "string" }, data_emissao: { type: "string" },
    chave_acesso: { type: "string" }, natureza: { type: "string" },
    destinatario: {
      type: "object",
      properties: {
        nome: { type: "string" }, cpf_cnpj: { type: "string" }, ie: { type: "string" },
        logradouro: { type: "string" }, numero: { type: "string" }, bairro: { type: "string" },
        municipio: { type: "string" }, uf: { type: "string" }, cep: { type: "string" }
      }
    },
    items: { type: "array", items: itemSchema },
    subtotal: { type: "number" }, frete: { type: "number" },
    desconto_total: { type: "number" }, total: { type: "number" }
  }
};

function parseNfeXml(xml) {
  const emit = xml.match(/<emit[^>]*>([\s\S]*?)<\/emit>/)?.[1] || "";
  const dest = xml.match(/<dest[^>]*>([\s\S]*?)<\/dest>/)?.[1] || "";
  const ender = dest.match(/<enderDest[^>]*>([\s\S]*?)<\/enderDest>/)?.[1] || "";
  const tot = xml.match(/<ICMSTot[^>]*>([\s\S]*?)<\/ICMSTot>/)?.[1] || "";
  const chave = xml.match(/Id="?NFe(\d{44})"?/)?.[1] || txt(xml, "chNFe");

  const items = [...xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)].map((m, i) => {
    const det = m[1];
    const prod = det.match(/<prod[^>]*>([\s\S]*?)<\/prod>/)?.[1] || "";
    const icms = det.match(/<ICMS\w*[^>]*>([\s\S]*?)<\/ICMS\w*>/)?.[1] || "";
    const qCom = num(txt(prod, "qCom"));
    const vUn = num(txt(prod, "vUnCom"));
    const vDesc = num(txt(prod, "vDesc"));
    return {
      codigo: txt(prod, "cProd"),
      descricao: txt(prod, "xProd"),
      ncm: txt(prod, "NCM"),
      cfop: txt(prod, "CFOP"),
      cst_csosn: txt(icms, "CSOSN") || txt(icms, "cST") || txt(icms, "CST"),
      unidade: txt(prod, "uCom") || "UN",
      quantidade: qCom,
      valor_unitario: vUn,
      desconto: vDesc,
      total: num(txt(prod, "vProd"))
    };
  });

  return {
    source: "xml",
    numero: txt(xml, "nNF"),
    serie: txt(xml, "serie"),
    data_emissao: (txt(xml, "dhEmi") || "").slice(0, 10),
    chave_acesso: chave,
    natureza: txt(xml, "natOp"),
    emissor_nome: txt(emit, "xNome"),
    destinatario: {
      nome: txt(dest, "xNome"),
      cpf_cnpj: txt(dest, "CNPJ") || txt(dest, "CPF"),
      ie: txt(dest, "IE"),
      logradouro: txt(ender, "xLgr"),
      numero: txt(ender, "nro"),
      bairro: txt(ender, "xBairro"),
      municipio: txt(ender, "xMun"),
      uf: txt(ender, "UF"),
      cep: txt(ender, "CEP")
    },
    items,
    subtotal: num(txt(tot, "vProd")),
    frete: num(txt(tot, "vFrete")),
    desconto_total: num(txt(tot, "vDesc")),
    total: num(txt(tot, "vNF"))
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

    const { file_url } = await req.json();
    if (!file_url) return Response.json({ error: "file_url obrigatório" }, { status: 400 });

    // Baixa o arquivo e decide o caminho: XML (parse direto) ou PDF (LLM com visão)
    const res = await fetch(file_url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return Response.json({ error: `Falha ao baixar o arquivo (${res.status})` }, { status: 400 });
    const head = (await res.text()).slice(0, 5000);
    const isXml = head.includes("<?xml") || head.includes("<nfeProc") || head.includes("<NFe") || head.includes("<infNFe");

    if (isXml) {
      // recarrega o corpo inteiro para o parse
      const full = await (await fetch(file_url, { signal: AbortSignal.timeout(20000) })).text();
      const data = parseNfeXml(full);
      if (!data.items.length) return Response.json({ error: "XML válido, mas nenhum item foi reconhecido" }, { status: 400 });
      return Response.json(data);
    }

    // PDF (DANFE) ou outro formato: extrai via LLM com visão
    const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Leia esta NF-e / DANFE (pode estar em PDF escaneado) e extraia os dados no JSON pedido. Regras:
- "destinatario" = o DESTINATÁRIO da nota (não o emissor).
- Itens: liste TODOS, com codigo, descricao, ncm, cfop, cst_csosn (CST ou CSOSN), unidade, quantidade, valor_unitario, desconto e total do item.
- Datas em AAAA-MM-DD. Use 0 em números ausentes. Não invente dados que não estão no documento.`,
      file_urls: [file_url],
      response_json_schema: LLM_SCHEMA
    });

    const d = llm || {};
    if (!d.items || !d.items.length) return Response.json({ error: "Nenhum item reconhecido no PDF" }, { status: 400 });
    return Response.json({ source: "pdf", ...d, items: d.items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}