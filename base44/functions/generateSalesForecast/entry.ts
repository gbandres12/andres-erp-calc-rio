import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { GoogleGenAI } from 'npm:@google/genai@1.0.1';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const companyId = payload.company_id;

        if (!companyId) {
            return Response.json({ error: 'Company ID is required' }, { status: 400 });
        }

        // 1. Fetch Historical Sales Data (Last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const startDate = sixMonthsAgo.toISOString().split('T')[0];

        const sales = await base44.entities.Sale.filter({
            company_id: companyId,
            status: { $in: ['concluida', 'faturada'] },
            sale_date: { $gte: startDate }
        });

        // 2. Fetch Pipeline Data (Open Quotes)
        const quotes = await base44.entities.Quote.filter({
            company_id: companyId,
            status: { $in: ['pendente', 'em_andamento', 'aprovado'] }
        });

        // 3. Aggregate Data
        const monthlySales = {};
        const weeklySales = {}; // Last 4 weeks
        let totalPipeline = 0;
        const pipelineByStatus = {};

        // Helper for ISO week
        const getWeek = (date) => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
            const week1 = new Date(d.getFullYear(), 0, 4);
            return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        };

        sales.forEach(sale => {
            const date = new Date(sale.sale_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const weekKey = `W${getWeek(date)}`;

            monthlySales[monthKey] = (monthlySales[monthKey] || 0) + sale.total;

            // Check if within last 4 weeks (approx)
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
            if (date >= fourWeeksAgo) {
                weeklySales[weekKey] = (weeklySales[weekKey] || 0) + sale.total;
            }
        });

        quotes.forEach(quote => {
            totalPipeline += quote.total || 0;
            pipelineByStatus[quote.status] = (pipelineByStatus[quote.status] || 0) + (quote.total || 0);
        });

        // 4. Prepare Context for LLM
        const contextData = {
            monthly_sales_history: monthlySales,
            recent_weekly_sales: weeklySales,
            current_pipeline_total: totalPipeline,
            pipeline_breakdown: pipelineByStatus,
            current_date: new Date().toISOString().split('T')[0]
        };

        const systemPrompt = `
        You are an expert Sales Forecasting AI.
        Analyze the provided sales data JSON (historical sales and current pipeline).
        
        Your task is to:
        1. Identify trends in the monthly and weekly sales data.
        2. Analyze the current pipeline strength.
        3. Predict sales for the UPCOMING WEEK and UPCOMING MONTH based on history + pipeline conversion probability (assume 40% conversion for general pipeline unless status is 'aprovado' then 90%).
        4. Provide a brief strategic recommendation.

        Output MUST be a valid JSON object with this structure:
        {
            "forecast_next_week": number,
            "forecast_next_month": number,
            "trend_analysis": "string description",
            "pipeline_analysis": "string description",
            "strategic_recommendation": "string description",
            "confidence_score": number (0-100)
        }
        `;

        // 5. Call LLM (Gemini)
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: systemPrompt + "\n\nDADOS:\n" + JSON.stringify(contextData) }] }],
            config: { responseMimeType: "application/json" }
        });

        const forecast = JSON.parse(result.text);

        return Response.json({
            ...forecast,
            historical_data: contextData
        });

    } catch (error) {
        console.error("Sales Forecast Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});