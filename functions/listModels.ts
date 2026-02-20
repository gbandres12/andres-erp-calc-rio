import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.12.0";

export async function listModels(req) {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return Response.json({ error: "No API Key" });

    // Try fetching via REST API to see available models directly if SDK fails
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    const data = await res.json();
    
    return Response.json(data);
}

Deno.serve(listModels);