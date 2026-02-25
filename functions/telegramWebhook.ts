import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    // Allow GET for connectivity check
    if (req.method !== "POST") {
        console.log("[Webhook] GET request received - Endpoint is accessible.");
        return new Response("Webhook is running! Send POST requests from Telegram here.");
    }

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        // Check for valid message
        if (!body.message) {
            return Response.json({ status: "ignored" });
        }

        const msg = body.message;
        let userText = msg.text;
        let voiceFileId = null;
        let photoFileId = null;
        let mediaType = "text";

        // Detectar tipo de mensagem
        if (msg.voice) {
            userText = "[Audio Message]";
            voiceFileId = msg.voice.file_id;
            mediaType = "voice";
        } else if (msg.photo && msg.photo.length > 0) {
            userText = msg.caption || "[Photo Message]";
            // Pegar a maior foto (última do array)
            const photo = msg.photo[msg.photo.length - 1];
            photoFileId = photo.file_id;
            mediaType = "photo";
        } else if (!msg.text) {
             // Ignorar se não for texto, voz ou foto
             return Response.json({ status: "ignored" });
        }
        
        // Fast duplication check (optional, but good practice)
        // We'll skip it for speed -> Let the queue processor handle deduplication if needed, 
        // or just accept that duplicate processing might happen rarely.
        // Priority is responding 200 OK fast.

        // Enqueue message
        await base44.asServiceRole.entities.TelegramMessageQueue.create({
            chat_id: String(msg.chat.id),
            user_text: userText,
            voice_file_id: voiceFileId,
            photo_file_id: photoFileId,
            media_type: mediaType,
            username: msg.from.first_name || "User",
            message_id: String(msg.message_id),
            raw_data: JSON.stringify(msg)
        });

        console.log(`[Webhook] Queued message from ${msg.chat.id} (${mediaType})`);
        // Respond immediately to Telegram
        return Response.json({ status: "queued" });

    } catch (error) {
        console.error("[Webhook] Error:", error);
        // Still return 200 to prevent Telegram from retrying endlessly on bad logic
        return Response.json({ status: "error", message: "internal_error" }); 
    }
}

Deno.serve(telegramWebhook);