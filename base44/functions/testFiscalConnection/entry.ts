// testFiscalConnection - Testa conexão direta com SEFAZ (sem API paga)
// Faz uma consulta de status do serviço (NfeStatusServico) via SOAP
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Endpoints SEFAZ por UF e ambiente
// Fonte: https://www.nfe.fazenda.gov.br/portal/webService.aspx
const SEFAZ_ENDPOINTS: Record<string, Record<string, string>> = {
  homologacao: {
    AM: 'https://homnfe.sefaz.am.gov.br/nfeweb/services/NfeStatusServico4',
    BA: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
    CE: 'https://nfeh.sefaz.ce.gov.br/nfe4/services/NFeStatusServico4',
    GO: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
    MG: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
    MS: 'https://hom.nfe.ms.gov.br/ws/NFeStatusServico4',
    MT: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
    PA: 'https://www.sefa.pa.gov.br/nfe/services/NFeStatusServico4',
    PE: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/NFeStatusServico4',
    PR: 'https://homologacao.nfe.pr.gov.br/nfe/NFeStatusServico4',
    RS: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    SP: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeStatusServico4.asmx',
    // SVRS (estados que usam SEFAZ Virtual RS em homologação)
    SVRS: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    // SVAN (Ambiente Nacional - homologação)
    SVAN: 'https://hom.nfe.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
  },
  producao: {
    AM: 'https://nfe.sefaz.am.gov.br/nfeweb/services/NfeStatusServico4',
    BA: 'https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
    CE: 'https://nfe.sefaz.ce.gov.br/nfe4/services/NFeStatusServico4',
    GO: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
    MG: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
    MS: 'https://nfe.ms.gov.br/ws/NFeStatusServico4',
    MT: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
    PA: 'https://www.sefa.pa.gov.br/nfe/services/NFeStatusServico4',
    PE: 'https://nfe.sefaz.pe.gov.br/nfe-service/NFeStatusServico4',
    PR: 'https://nfe.pr.gov.br/nfe/NFeStatusServico4',
    RS: 'https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    SP: 'https://nfe.fazenda.sp.gov.br/ws/nfeStatusServico4.asmx',
    // SVRS (estados que usam SEFAZ Virtual RS em produção)
    SVRS: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    // SVAN (Ambiente Nacional - produção)
    SVAN: 'https://www.nfe.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
  }
};

// Estados que usam SVRS em produção
const SVRS_STATES = ['AC','AL','AP','DF','ES','PB','PI','RJ','RN','RO','RR','SC','SE','TO'];
// Estados que usam SVAN
const SVAN_STATES = ['MA','PA'];

function getEndpoint(uf: string, environment: string): string {
  const env = SEFAZ_ENDPOINTS[environment] || SEFAZ_ENDPOINTS.homologacao;
  if (env[uf]) return env[uf];
  if (SVRS_STATES.includes(uf)) return env['SVRS'];
  if (SVAN_STATES.includes(uf)) return env['SVAN'];
  return env['SVRS']; // fallback
}

// Código IBGE do município (cMunFG) — usar 9999999 para testes
function buildStatusSOAP(cUF: string, tpAmb: string): string {
  const cUFMap: Record<string, string> = {
    AC:'12',AL:'27',AM:'13',AP:'16',BA:'29',CE:'23',DF:'53',ES:'32',GO:'52',
    MA:'21',MG:'31',MS:'50',MT:'51',PA:'15',PB:'25',PE:'26',PI:'22',PR:'41',
    RJ:'33',RN:'24',RO:'11',RR:'14',RS:'43',SC:'42',SE:'28',SP:'35',TO:'17'
  };
  const cUFNum = cUFMap[cUF] || '35';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
      <cUF>${cUFNum}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
      <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${tpAmb}</tpAmb>
        <cUF>${cUFNum}</cUF>
        <xServ>STATUS</xServ>
      </consStatServ>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem testar a conexão fiscal' }, { status: 403 });
    }

    const { company_id } = await req.json();
    if (!company_id) return Response.json({ error: 'company_id obrigatório' }, { status: 400 });

    const configs = await base44.asServiceRole.entities.FiscalConfig.filter({ company_id });
    const config = configs[0];
    if (!config) return Response.json({ error: 'Configuração fiscal não encontrada' }, { status: 404 });
    if (!config.uf) return Response.json({ error: 'UF do emitente não configurada' }, { status: 400 });

    const uf = config.uf.toUpperCase();
    const environment = config.environment || 'homologacao';
    const tpAmb = environment === 'producao' ? '1' : '2';
    const endpoint = getEndpoint(uf, environment);

    const soapBody = buildStatusSOAP(uf, tpAmb);

    const startTime = Date.now();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF',
        },
        body: soapBody,
        signal: AbortSignal.timeout(20000),
      });
    } catch (fetchErr) {
      await base44.asServiceRole.entities.FiscalConfig.update(config.id, {
        last_test_at: new Date().toISOString(),
        last_test_status: 'erro'
      });
      return Response.json({
        success: false,
        error: `Falha ao conectar com SEFAZ: ${fetchErr.message}`,
        endpoint,
        environment,
        uf
      });
    }

    const duration = Date.now() - startTime;
    const responseText = await response.text();
    const httpStatus = response.status;

    // Extrair cStat e xMotivo do XML de resposta
    const cStatMatch = responseText.match(/<cStat>(\d+)<\/cStat>/);
    const xMotivoMatch = responseText.match(/<xMotivo>([^<]+)<\/xMotivo>/);
    const cStat = cStatMatch?.[1] || null;
    const xMotivo = xMotivoMatch?.[1] || null;

    // cStat 107 = Serviço em Operação, 108 = Serviço Paralisado Temporariamente
    const isOperational = cStat === '107';
    const testStatus = (httpStatus >= 200 && httpStatus < 300 && cStat) ? 
      (isOperational ? 'ok' : 'erro') : 'erro';

    await base44.asServiceRole.entities.FiscalConfig.update(config.id, {
      last_test_at: new Date().toISOString(),
      last_test_status: testStatus
    });

    return Response.json({
      success: testStatus === 'ok',
      http_status: httpStatus,
      cStat,
      xMotivo,
      endpoint,
      environment,
      uf,
      duration_ms: duration,
      is_operational: isOperational,
      message: isOperational
        ? `✅ SEFAZ ${uf} em operação (cStat: ${cStat} - ${xMotivo})`
        : `⚠️ SEFAZ respondeu mas não está em operação normal (cStat: ${cStat} - ${xMotivo || 'sem motivo'})`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});