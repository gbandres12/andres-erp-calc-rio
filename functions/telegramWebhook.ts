import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    const base44 = createClientFromRequest(req);
    const BOT_Token = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!BOT_Token) return Response.json({ error: "No Token" }, { status: 500 });

    const sendTelegram = async (chatId, text) => {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_Token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
        } catch (e) { console.error("Send Error:", e); }
    };

    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (!body.message || !body.message.text) return Response.json({ status: "ignored" });

            const chatId = String(body.message.chat.id);
            const userText = body.message.text;
            const username = body.message.from.first_name || "User";

            console.log(`Msg from ${username}: ${userText}`);

            // 1. Session Management
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

            // 2. Retrieve Conversation
            // We fetch the conversation to get the current state
            let conversation = await base44.asServiceRole.agents.getConversation(conversationId);
            
            // Fix for potential SDK issue: ensure messages is an array
            if (!conversation.messages) conversation.messages = [];
            
            const initialMsgCount = conversation.messages.length;

            // 3. Send Message to Agent
            // Using asServiceRole to ensure we have permissions
            try {
                await base44.asServiceRole.agents.addMessage(conversation, {
                    role: "user", 
                    content: userText
                });
            } catch (error) {
                console.error("SDK addMessage error:", error);
                // If the error is 'Cannot read properties of undefined', it might be a bug in the SDK response handling
                // BUT the message might have been sent to the server.
                // We will proceed to poll for the response anyway.
            }

            // 4. Poll for Response
            let attempts = 0;
            const maxAttempts = 40; // 60 seconds
            let lastProcessedMsgId = null;

            // If we have messages, track the last one to know what's new
            if (initialMsgCount > 0) {
                // This is a naive check, ideally we use IDs
                // But let's stick to count + role check for now
            }

            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1500));
                
                const updatedConv = await base44.asServiceRole.agents.getConversation(conversationId);
                const messages = updatedConv.messages || [];
                
                if (messages.length > initialMsgCount) {
                    // Look at the new messages
                    const newMessages = messages.slice(initialMsgCount);
                    
                    // Find the last assistant message
                    // We want to send the FINAL response, or intermediate ones?
                    // Usually the last one is the response.
                    
                    const lastMsg = newMessages[newMessages.length - 1];
                    
                    // Check if it's from assistant and has content (not just a tool call)
                    if (lastMsg.role === 'assistant' && lastMsg.content) {
                        
                        // Check if we are done (not strictly possible to know if "done" without status, 
                        // but usually if content is present and it's the last msg, it's the answer)
                        
                        // Also check if there are any tool calls in the last message that are pending?
                        // The SDK usually handles the tool loop. When we see a text response, it's usually the answer.
                        
                        // We avoid sending duplicates if we loop (though we break immediately)
                        console.log("Response found:", lastMsg.content);
                        await sendTelegram(chatId, lastMsg.content);
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