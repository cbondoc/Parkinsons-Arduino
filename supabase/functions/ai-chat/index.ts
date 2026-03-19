// Supabase Edge Function: ai-chat
// Receives { messages, context } and returns { reply }.
// Keep API keys in Supabase secrets (never in the browser).

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin: string | null) {
  // For easiest setup we allow all origins. Tighten this for production.
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Include apikey because the web app sends it for Supabase Functions auth.
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as any).role as ChatRole;
    const content = asString((m as any).content);
    if (!content) continue;
    if (role !== "system" && role !== "user" && role !== "assistant") continue;
    out.push({ role, content });
  }
  return out;
}

type GeminiRole = "user" | "model";
type GeminiContent = { role: GeminiRole; parts: { text: string }[] };

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    const role: GeminiRole = m.role === "assistant" ? "model" : "user";
    out.push({ role, parts: [{ text: m.content }] });
  }
  return out;
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  context: unknown;
}) {
  const { apiKey, model, messages, context } = params;

  const systemInstruction =
    "You are a helpful health assistant. You explain the tremor report in plain language, highlight patterns, " +
    "and help the user prepare questions for a clinician. Do not diagnose. If asked for medical advice, " +
    "recommend consulting a licensed clinician. Use the provided context summary as the only patient data.";

  const contents = toGeminiContents(messages);
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    encodeURIComponent(model) +
    `:generateContent?key=` +
    encodeURIComponent(apiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.2 },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini error (${res.status}): ${text}`.slice(0, 2000));
  }

  let jsonResp: any;
  try {
    jsonResp = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response.");
  }

  const candidateText =
    jsonResp?.candidates?.[0]?.content?.parts?.map?.((p: any) => p?.text).filter(Boolean).join("") ??
    null;
  if (typeof candidateText === "string" && candidateText.trim()) return candidateText;

  throw new Error("Gemini response missing candidate text.");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, cors);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  // Model names change over time; use a "latest" alias by default.
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
  if (!apiKey) {
    return json(500, { error: "Missing GEMINI_API_KEY secret on server." }, cors);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." }, cors);
  }

  const messages = normalizeMessages(body?.messages);
  const context = body?.context ?? null;

  // Keep payload small and safe.
  const trimmed = messages.slice(-20).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 4000),
  }));

  try {
    // Append context as a final user message so Gemini sees it.
    const withContext: ChatMessage[] = [
      ...trimmed,
      {
        role: "user",
        content: `Context summary (JSON):\n${JSON.stringify(context ?? null)}`,
      },
    ];

    const reply = await callGemini({
      apiKey,
      model,
      messages: withContext,
      context,
    });
    return json(200, { reply }, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(502, { error: msg }, cors);
  }
});

