import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) {
        console.error("TELEGRAM_BOT_TOKEN missing");
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

    if (req.method === "GET") {
        return new Response("Telegram Webhook is active.");
    }

    if (req.method === "POST") {
        try {
            const body = await req.json();
            
            if (!body.message || !body.message.text) {
                return Response.json({ status: "ignored" });
            }

            const chatId = String(body.message.chat.id);
            const text = body.message.text;
            const username = body.message.from.first_name || "User";

            console.log(`Processing message from ${username} (${chatId}): ${text}`);

            // 1. Session Management
            const sessions = await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chatId });
            let conversationId;

            if (sessions.length > 0) {
                conversationId = sessions[0].conversation_id;
            } else {
                console.log("Creating new conversation...");
                const conversation = await base44.asServiceRole.agents.createConversation({
                    agent_name: "financeiro",
                    metadata: {
                        name: `Telegram Chat ${chatId}`,
                        telegram_chat_id: chatId,
                        user_name: username
                    }
                });
                conversationId = conversation.id;

                await base44.asServiceRole.entities.TelegramChatSession.create({
                    chat_id: chatId,
                    conversation_id: conversationId
                });
            }

            // 2. Interaction
            console.log(`Using conversation ID: ${conversationId}`);
            
            // Get conversation state
            const conversation = await base44.asServiceRole.agents.getConversation(conversationId);
            const initialMsgCount = conversation.messages ? conversation.messages.length : 0;

            // Send user message
            await base44.asServiceRole.agents.addMessage(conversation, {
                role: "user",
                content: text
            });

            // 3. Polling for response
            let attempts = 0;
            const maxAttempts = 30; // 45 seconds max
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1500));
                
                const updatedConv = await base44.asServiceRole.agents.getConversation(conversationId);
                const messages = updatedConv.messages || [];
                
                if (messages.length > initialMsgCount) {
                    // Check the last message
                    const lastMsg = messages[messages.length - 1];
                    
                    // If it's the assistant and it has content (and is not a tool call in progress which usually has null content or specific status)
                    if (lastMsg.role === 'assistant' && lastMsg.content) {
                        console.log("Response found, sending to Telegram");
                        await sendTelegramMessage(chatId, lastMsg.content);
                        return Response.json({ status: "success" });
                    }
                }
                attempts++;
            }

            // Timeout or no response
            return Response.json({ status: "timeout_or_processing" });

        } catch (error) {
            console.error("Webhook Critical Error:", error);
            return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
        }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
}

Deno.serve(telegramWebhook);