import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function debugTelegram(req) {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    
    if (!token) {
        return Response.json({ error: "Secret TELEGRAM_BOT_TOKEN not found" });
    }

    try {
        // 1. Check Webhook Status
        const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const data = await response.json();

        // 2. Check Me (Bot Info)
        const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const meData = await meResponse.json();

        return Response.json({
            webhook_info: data,
            bot_info: meData,
            guidance: "Check if 'url' matches your function URL. Check 'last_error_message' for delivery failures."
        });

    } catch (error) {
        return Response.json({ error: error.message });
    }
}

Deno.serve(debugTelegram);