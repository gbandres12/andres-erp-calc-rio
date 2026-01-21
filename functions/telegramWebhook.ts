
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function telegramWebhook(req) {
    console.log("Webhook v3 starting");
    const base44 = createClientFromRequest(req);
    
    // Debug SDK
    console.log("Agents methods:", Object.keys(base44.asServiceRole.agents));
    
    return Response.json({ status: "debug" });
}

Deno.serve(telegramWebhook);
