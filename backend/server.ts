// backend/server.ts
import "jsr:@std/dotenv/load";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  AnthropicModelProvider,
  ZypherAgent,
} from "@corespeed/zypher";
import Anthropic from "npm:@anthropic-ai/sdk";

// env helper
function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Environment variable ${name} is not set`);
  return value;
}

// System instructions for the agent / model
const baseInstructions = `
You are a crypto analysis agent. The frontend will send you a token symbol
like BTC, ETH, or AVAX.

Your job:
1. Briefly describe the asset's typical narrative or use case.
2. Give three very short bullet points about what a short term trader should
   watch (volatility, liquidity, news sensitivity, etc.).
3. End with one clear line that says this is not financial advice.

Keep every answer under 220 words.
Do not invent prices or fake numbers.
`;

// --- Start a Zypher agent (for the assignment) ---
const zypher = new ZypherAgent(
  new AnthropicModelProvider({
    apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
  }),
  {
    customInstructions: baseInstructions,
  },
);

// --- Anthropic client (used for actual responses) ---
const anthropic = new Anthropic({
  apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
});

// CORS
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Use Anthropic directly to generate the crypto analysis
async function runCryptoTask(symbol: string): Promise<string> {
  const cleaned = symbol.trim().toUpperCase() || "BTC";

  const userPrompt = `
${baseInstructions}

User request:
Give me a concise analysis for the token with symbol "${cleaned}".
Focus on the narrative and what a short term trader should pay attention to.
`;

  const resp = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 512,
  messages: [
    {
      role: "user",
      content: userPrompt,
    },
  ],
});


  // Anthropic SDK returns an array of content blocks; join any text segments
  let text = "";

  for (const block of resp.content) {
    // text block
    if (block.type === "text") {
      text += block.text;
    }
  }

  return text.trim() || "Model did not return any text.";
}

// HTTP server
serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/api/crypto") {
    try {
      const body = await req.json().catch(() => ({}));
      const symbol =
        typeof body.symbol === "string" && body.symbol.trim().length > 0
          ? body.symbol
          : "BTC";

      const analysis = await runCryptoTask(symbol);

      return new Response(
        JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          analysis,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...cors,
          },
        },
      );
    } catch (err: any) {
      console.error("Error in /api/crypto:", err);
      return new Response(
        JSON.stringify({ error: err?.message ?? "Internal error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }
  }

  return new Response("Not found", { status: 404, headers: cors });
});
