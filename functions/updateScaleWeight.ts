import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function updateScaleWeight(req) {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const { weight, company_id, secret_token } = await req.json();

        // Validar token simples para segurança básica (opcional, configurável via ENV)
        const EXPECTED_TOKEN = Deno.env.get("SCALE_API_TOKEN");
        if (EXPECTED_TOKEN && secret_token !== EXPECTED_TOKEN) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (typeof weight !== 'number' || !company_id) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Usar service role pois o script local não é um usuário logado
        // Tenta encontrar estado existente para essa empresa
        const existingStates = await base44.asServiceRole.entities.ScaleState.filter({ 
            company_id: company_id 
        });

        const now = new Date().toISOString();

        if (existingStates.length > 0) {
            // Atualiza
            await base44.asServiceRole.entities.ScaleState.update(existingStates[0].id, {
                current_weight: weight,
                last_update: now
            });
        } else {
            // Cria novo
            await base44.asServiceRole.entities.ScaleState.create({
                company_id: company_id,
                current_weight: weight,
                last_update: now,
                device_id: 'default'
            });
        }

        return Response.json({ success: true, timestamp: now });

    } catch (error) {
        console.error("Scale Update Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

Deno.serve(updateScaleWeight);