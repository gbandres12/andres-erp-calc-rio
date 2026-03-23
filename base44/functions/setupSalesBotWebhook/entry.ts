import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function setupSalesBotWebhook(req) {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { baseUrl, token } = await req.json();
    
    // Prioriza o token enviado, senão usa o do ambiente
    const BOT_TOKEN = token || Deno.env.get("SALES_BOT_TOKEN");

    if (!BOT_TOKEN) return Response.json({ error: "Token não configurado (SALES_BOT_TOKEN)" }, { status: 400 });

    try {
        // Remove trailing slash if exists
        const cleanBaseUrl = baseUrl.replace(/\/$/, "");
        const webhookUrl = `${cleanBaseUrl}/functions/salesWebhook`;

        console.log(`Setting webhook to: ${webhookUrl} using token ending in ...${BOT_TOKEN.slice(-5)}`);

        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
        const data = await res.json();

        // Get Webhook Info para confirmar
        const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
        const infoData = await infoRes.json();

        return Response.json({ 
            setup_result: data, 
            webhook_info: infoData,
            webhook_url_used: webhookUrl 
        });
    } catch (e) {
        console.error("Setup Error:", e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}

Deno.serve(setupSalesBotWebhook);