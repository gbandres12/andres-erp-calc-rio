import { createClientFromRequest } from 'npm:@base44/sdk@0.8.12';

export async function processTelegramQueue(req) {
    console.error("[DEBUG] Minimal Deployment Check");
    return Response.json({ status: "minimal_deployed" });
}

Deno.serve(processTelegramQueue);