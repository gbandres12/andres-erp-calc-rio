import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    if (req.method !== "POST") return new Response("OK");

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        // Check for valid message
        if (!body.message || !body.message.text) {
            return Response.json({ status: "ignored" });
        }

        const msg = body.message;
        
        // Fast duplication check (optional, but good practice)
        // We'll skip it for speed -> Let the queue processor handle deduplication if needed, 
        // or just accept that duplicate processing might happen rarely.
        // Priority is responding 200 OK fast.

        // Enqueue message
        await base44.asServiceRole.entities.TelegramMessageQueue.create({
            chat_id: String(msg.chat.id),
            user_text: msg.text,
            username: msg.from.first_name || "User",
            message_id: String(msg.message_id),
            raw_data: JSON.stringify(msg)
        });

        console.log(`[Webhook] Queued message from ${msg.chat.id}`);
        // Respond immediately to Telegram
        return Response.json({ status: "queued" });

    } catch (error) {
        console.error("[Webhook] Error:", error);
        // Still return 200 to prevent Telegram from retrying endlessly on bad logic
        return Response.json({ status: "error", message: "internal_error" }); 
    }
}

Deno.serve(telegramWebhook);