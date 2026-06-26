import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function salesWebhook(req) {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const base44 = createClientFromRequest(req);
    const SALES_BOT_TOKEN = Deno.env.get("SALES_BOT_TOKEN");

    try {
        const body = await req.json();
        
        // Verificação simples de token (opcional, mas recomendada se URL for pública)
        // const urlToken = new URL(req.url).searchParams.get("token");
        // if (urlToken !== SALES_BOT_TOKEN) return new Response("Unauthorized", { status: 401 });

        if (body.message) {
            const chatId = body.message.chat.id.toString();
            const text = body.message.text || "";
            const username = body.message.from.username || "Unknown";
            const messageId = body.message.message_id.toString();
            
            let mediaType = "text";
            let voiceFileId = null;

            if (body.message.voice) {
                mediaType = "voice";
                voiceFileId = body.message.voice.file_id;
            }

            // Evitar duplicidade simples
            const exists = await base44.asServiceRole.entities.SalesTelegramQueue.filter({ message_id: messageId });
            if (exists.length === 0) {
                const record = await base44.asServiceRole.entities.SalesTelegramQueue.create({
                    chat_id: chatId,
                    user_text: text || "[Audio/Midia]",
                    username: username,
                    message_id: messageId,
                    media_type: mediaType,
                    voice_file_id: voiceFileId
                });

                // Passa todos os dados necessários para o processamento
                await base44.asServiceRole.functions.invoke("processSalesQueue", { 
                    data: { 
                        id: record.id,
                        chat_id: chatId, 
                        user_text: text || "[Audio/Midia]",
                        media_type: mediaType,
                        voice_file_id: voiceFileId
                    } 
                });
            }
        }

        return new Response("OK", { status: 200 });
    } catch (e) {
        console.error("Webhook Error:", e);
        return new Response("Error", { status: 500 });
    }
}

Deno.serve(salesWebhook);