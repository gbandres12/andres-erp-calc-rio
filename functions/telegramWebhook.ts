import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) {
        return Response.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
    }

    // Helper to send message to Telegram
    const sendTelegramMessage = async (chatId, text) => {
        const url = `https://api.telegram.org/bot${BOT_Token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    };

    if (req.method === "GET") {
        return new Response("Telegram Webhook is active. Please register this URL with the Telegram Bot API.");
    }

    if (req.method === "POST") {
        try {
            const body = await req.json();
            
            // Check if it's a message
            if (!body.message || !body.message.text) {
                return Response.json({ status: "ignored" });
            }

            const chatId = String(body.message.chat.id);
            const text = body.message.text;
            const username = body.message.from.first_name || "User";

            // 1. Find or Create Session using Service Role (to access the mapping entity securely if needed, though regular user might work if public)
            // Using service role for the session mapping to ensure consistency
            const sessions = await base44.asServiceRole.entities.TelegramChatSession.filter({ chat_id: chatId });
            
            let conversationId;

            if (sessions.length > 0) {
                conversationId = sessions[0].conversation_id;
            } else {
                // Create new conversation
                // Note: The conversation itself is associated with the authenticated user context.
                // Since this is a webhook without a user session, the conversation might be created anonymously or we need to impersonate/handle context.
                // Agents usually run in the context of the user. Here, we might want to treat the telegram user as a specific system user or just use the agent anonymously if allowed.
                // For now, we'll create it via the SDK.
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

            // 2. Send message to Agent
            // We need to fetch the conversation object first to pass it to addMessage, or pass the ID if SDK supports it.
            // Based on instructions: base44.agents.addMessage(conversation, message)
            const conversation = await base44.asServiceRole.agents.getConversation(conversationId);
            
            await base44.asServiceRole.agents.addMessage(conversation, {
                role: "user",
                content: text
            });

            // 3. Poll for response
            // We'll poll for a few seconds to see if we get a response
            let attempts = 0;
            const maxAttempts = 20; // 20 * 1.5s = 30s max
            let lastMessageCount = conversation.messages.length + 1; // +1 for the user message we just added

            // We need to loop getting the conversation and checking for new messages
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1500));
                
                const updatedConv = await base44.asServiceRole.agents.getConversation(conversationId);
                const messages = updatedConv.messages;
                
                // Check if we have a new assistant message that is done (not tool call in progress)
                // We look for the last message
                const lastMsg = messages[messages.length - 1];

                if (messages.length > conversation.messages.length) {
                    // We have new messages.
                    // If the last message is from assistant and has content, we can send it.
                    // Note: The agent might do tool calls intermediate steps.
                    // We want to capture the final text response.
                    
                    if (lastMsg.role === 'assistant' && lastMsg.content) {
                        await sendTelegramMessage(chatId, lastMsg.content);
                        break;
                    }
                }
                
                attempts++;
            }

            return Response.json({ status: "success" });

        } catch (error) {
            console.error("Webhook Error:", error);
            // Don't send error details to Telegram user, just log
            return Response.json({ error: error.message }, { status: 500 });
        }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
}

Deno.serve(telegramWebhook);