import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) {
        return Response.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
    }

    const sendTelegramMessage = async (chatId, text) => {
        try {
            const url = `https://api.telegram.org/bot${BOT_Token}/sendMessage`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
        } catch (e) {
            console.error("Error sending Telegram message:", e);
        }
    };

    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (!body.message || !body.message.text) return Response.json({ status: "ignored" });

            const chatId = String(body.message.chat.id);
            const text = body.message.text;
            const username = body.message.from.first_name || "User";

            console.log(`Msg from ${username}: ${text}`);

            // 1. Session
            const sessions = await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chatId });
            let conversationId;

            if (sessions.length > 0) {
                conversationId = sessions[0].conversation_id;
            } else {
                console.log("Creating conversation...");
                const conversation = await base44.asServiceRole.agents.createConversation({
                    agent_name: "financeiro",
                    metadata: { name: `Telegram ${chatId}`, telegram_chat_id: chatId }
                });
                conversationId = conversation.id;
                await base44.asServiceRole.entities.TelegramChatSession.create({
                    chat_id: chatId, conversation_id: conversationId
                });
            }

            // 2. Add Message
            let conversation = await base44.asServiceRole.agents.getConversation(conversationId);
            
            // Clean object to avoid SDK internal errors
            const cleanConv = JSON.parse(JSON.stringify(conversation));
            if (!cleanConv.messages) cleanConv.messages = [];
            
            const initialMsgCount = cleanConv.messages.length;

            try {
                await base44.asServiceRole.agents.addMessage(cleanConv, {
                    role: "user", content: text
                });
            } catch (err) {
                console.error("addMessage error (ignoring):", err.message);
            }

            // 3. Poll
            let attempts = 0;
            while (attempts < 30) {
                await new Promise(r => setTimeout(r, 1000));
                
                const updatedConv = await base44.asServiceRole.agents.getConversation(conversationId);
                const messages = updatedConv.messages || [];
                
                if (messages.length > initialMsgCount) {
                    const lastMsg = messages[messages.length - 1];
                    // Log for debug
                    console.log(`Poll ${attempts}: Found msg role=${lastMsg.role}`);
                    
                    if (lastMsg.role === 'assistant' && lastMsg.content) {
                        await sendTelegramMessage(chatId, lastMsg.content);
                        return Response.json({ status: "success" });
                    }
                }
                attempts++;
            }
            
            return Response.json({ status: "timeout" });

        } catch (error) {
            console.error("Error:", error);
            return Response.json({ error: error.message }, { status: 500 });
        }
    }

    return new Response("OK");
}

Deno.serve(telegramWebhook);