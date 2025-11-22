// backend/server.ts
import "jsr:@std/dotenv/load";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  AnthropicModelProvider,
  ZypherAgent,
  type ZypherContext,
  type TaskEvent,
} from "@corespeed/zypher";
import { eachValueFrom } from "npm:rxjs-for-await";

// ---------- helpers ----------

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

// instructions we want the agent to follow
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
// ---------- Zypher context and directories ----------

const cwd = Deno.cwd();
const zypherDir = `${cwd}/.zypher`;
const workspaceDataDir = `${zypherDir}/workspace`;
const fileAttachmentCacheDir = `${zypherDir}/cache/files`;

// make sure folders exist
await Deno.mkdir(workspaceDataDir, { recursive: true });
await Deno.mkdir(fileAttachmentCacheDir, { recursive: true });

const context: ZypherContext = {
  workingDirectory: cwd,
  zypherDir,
  workspaceDataDir,
  fileAttachmentCacheDir,
  userId: "local-user",
};

// ---------- Zypher agent ----------

const provider = new AnthropicModelProvider({
  apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
});

const agent = new ZypherAgent(context, provider, {
  config: {
    maxIterations: 8,
    maxTokens: 800,
    taskTimeoutMs: 60_000,
  },
});

// ---------- CORS ----------

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- run task through Zypher ----------

async function runCryptoTask(symbolRaw: string): Promise<string> {
  const symbol = (symbolRaw || "").trim().toUpperCase() || "BTC";

  const taskDescription = `
${baseInstructions}

User request:
Give me a concise analysis for the token with symbol "${symbol}".
Focus on the narrative and what a short term trader should pay attention to.
  `.trim();

  const events$ = agent.runTask(
    taskDescription,
    "claude-sonnet-4-20250514",
  );

  let text = "";

  for await (const event of eachValueFrom<TaskEvent>(events$)) {
    if (event.type === "text") {
      text += event.content;
    }
  }

  await agent.wait().catch(() => {});

  return text.trim() || "Agent finished without returning a response.";
}

// ---------- HTTP server ----------

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

console.log("🚀 Zypher backend running at http://localhost:8000/");
