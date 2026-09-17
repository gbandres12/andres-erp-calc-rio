import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

// Estima altura média da carga de um caminhão a partir de fotos (cubagem por IA)
// e calcula volume, toneladas e divergência vs balança.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      photos = [],
      bed_length_m,
      bed_width_m,
      bed_edge_height_m,
      density_factor_t_m3,
      scale_net_kg = null,
      tolerance_percent = 5
    } = await req.json();

    if (!photos.length) return Response.json({ error: 'Envie ao menos uma foto' }, { status: 400 });
    if (!bed_length_m || !bed_width_m || !bed_edge_height_m) {
      return Response.json({ error: 'Dimensões da caçamba incompletas' }, { status: 400 });
    }
    if (!density_factor_t_m3) {
      return Response.json({ error: 'Fator t/m³ não informado' }, { status: 400 });
    }

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em cubagem de cargas a granel (calcário, gesso, areia).
Receberá ${photos.length} foto(s) de um caminhão carregado, em sequência: lateral inteira, diagonal 45° traseira e frontal curta.
A borda da caçamba tem altura conhecida de ${bed_edge_height_m} metros em relação ao piso da caçamba.

Tarefas:
1. Avalie a qualidade de cada foto: o caminhão está inteiro na moldura? Boa iluminação? Foco? Ângulo correto?
2. Use a borda da caçamba como régua visual e estime a altura MÉDIA da carga, medida do PISO da caçamba até o topo médio da carga, em metros.
   - Carga rasada: topo plano rente à borda → altura ≈ ${bed_edge_height_m} m
   - Carga em monte/cone: média entre a borda e o pico do monte
3. Descreva a forma da carga (rasada ou monte).

Retorne JSON estrito:
{
  "photos_quality": [{ "index": 0, "ok": true, "issue": "" }],
  "load_shape": "rasada" | "monte",
  "estimated_height_m": número em metros,
  "confidence": "alta" | "media" | "baixa"
}`,
      file_urls: photos,
      response_json_schema: {
        type: 'object',
        properties: {
          photos_quality: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number' },
                ok: { type: 'boolean' },
                issue: { type: 'string' }
              },
              required: ['index', 'ok']
            }
          },
          load_shape: { type: 'string', enum: ['rasada', 'monte'] },
          estimated_height_m: { type: 'number' },
          confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] }
        },
        required: ['photos_quality', 'estimated_height_m', 'confidence']
      }
    });

    const height = Number(res.estimated_height_m) || 0;
    if (height <= 0) {
      return Response.json({ error: 'IA não conseguiu estimar a altura da carga a partir das fotos' }, { status: 422 });
    }

    const volumeM3 = bed_length_m * bed_width_m * height;
    const estimatedTons = volumeM3 * density_factor_t_m3;

    const marginByConfidence = { alta: 5, media: 10, baixa: 15 };
    const margin = marginByConfidence[res.confidence] ?? 10;

    let diffPercent = null;
    let alert = false;
    if (scale_net_kg && scale_net_kg > 0) {
      const scaleTons = scale_net_kg / 1000;
      diffPercent = ((estimatedTons - scaleTons) / scaleTons) * 100;
      alert = Math.abs(diffPercent) > tolerance_percent;
    }

    return Response.json({
      photos_quality: res.photos_quality || [],
      load_shape: res.load_shape || '',
      estimated_height_m: height,
      volume_m3: Math.round(volumeM3 * 100) / 100,
      estimated_tons: Math.round(estimatedTons * 100) / 100,
      confidence: res.confidence,
      margin_percent: margin,
      diff_percent: diffPercent === null ? null : Math.round(diffPercent * 10) / 10,
      alert
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}