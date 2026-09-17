import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

// Leitura automática de documentos por IA:
// - Modo placa: recebe plate_photo_url e retorna a placa legível
// - Modo cadastro: recebe cnh_photo_url (+ truck_photo_url) e extrai os dados do motorista
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { plate_photo_url, cnh_photo_url, truck_photo_url } = await req.json();

    if (!plate_photo_url && !cnh_photo_url) {
      return Response.json({ error: 'Envie plate_photo_url ou cnh_photo_url' }, { status: 400 });
    }

    // --- Modo placa: extrai a placa da foto ---
    if (plate_photo_url && !cnh_photo_url) {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Analise a foto da placa de um veículo brasileiro e extraia o texto da placa.
Formatos possíveis: antigo (ABC1234) ou Mercosul (ABC1D23).
Retorne a placa em MAIÚSCULAS, apenas letras e números, sem espaços ou hífen.
Se a placa não estiver legível, retorne string vazia e explique em warnings.`,
        file_urls: [plate_photo_url],
        response_json_schema: {
          type: 'object',
          properties: {
            plate: { type: 'string' },
            confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            warnings: { type: 'string' }
          },
          required: ['plate', 'confidence']
        }
      });
      const plate = String(res.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return Response.json({
        mode: 'plate',
        plate,
        confidence: res.confidence,
        warnings: res.warnings || ''
      });
    }

    // --- Modo cadastro: extrai dados da CNH e a placa do caminhão ---
    const fileUrls = truck_photo_url ? [cnh_photo_url, truck_photo_url] : [cnh_photo_url];
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analise a foto da CNH (Carteira Nacional de Habilitação) brasileira${truck_photo_url ? ' e a foto do caminhão' : ''}.
Extraia os dados do condutor:
- driver_name: nome completo do condutor
- driver_cpf: CPF somente com números (11 dígitos)
- cnh_number: número de registro do documento
- cnh_category: categoria da habilitação (ACC, A, B, C, D, E ou combinações como AB)
- cnh_valid_until: data de validade no formato AAAA-MM-DD
- plate: ${truck_photo_url ? 'placa visível na foto do caminhão, MAIÚSCULAS, apenas letras e números (vazio se não legível)' : 'string vazia'}
- warnings: observações sobre legibilidade ou campos não legíveis

Se algum campo não estiver legível, retorne string vazia e cite o campo em warnings.`,
      file_urls: fileUrls,
      response_json_schema: {
        type: 'object',
        properties: {
          driver_name: { type: 'string' },
          driver_cpf: { type: 'string' },
          cnh_number: { type: 'string' },
          cnh_category: { type: 'string' },
          cnh_valid_until: { type: 'string' },
          plate: { type: 'string' },
          warnings: { type: 'string' }
        },
        required: ['driver_name', 'plate', 'warnings']
      }
    });

    return Response.json({
      mode: 'documents',
      driver_name: String(res.driver_name || '').trim(),
      driver_cpf: String(res.driver_cpf || '').replace(/\D/g, ''),
      cnh_number: String(res.cnh_number || '').trim(),
      cnh_category: String(res.cnh_category || '').toUpperCase().trim(),
      cnh_valid_until: String(res.cnh_valid_until || ''),
      plate: String(res.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      warnings: String(res.warnings || '')
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}