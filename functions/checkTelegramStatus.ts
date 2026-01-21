import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function checkTelegramStatus(req) {
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!BOT_Token) return Response.json({ error: "No Token" });

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_Token}/getWebhookInfo`);
        const data = await response.json();
        
        const base44 = createClientFromRequest(req);
        const queueItems = await base44.asServiceRole.entities.TelegramMessageQueue.list({limit: 5});
        
        return Response.json({ 
            webhook: data, 
            queue_preview: queueItems
        });
    } catch (e) {
        return Response.json({ error: e.message });
    }
}

Deno.serve(checkTelegramStatus);