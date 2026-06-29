// Server-side LLM via any OpenAI-compatible endpoint (Groq, OpenRouter,
// local, etc.). Configured by LLM_BASE_URL (+ LLM_API_KEY, LLM_MODEL).
// Used by the daily digest and the /ask endpoint.
const BASE = process.env.LLM_BASE_URL || "";

export const llmEnabled = !!BASE;

export async function chat(messages, { temperature = 0.2, max_tokens = 512 } = {}) {
  if (!BASE) throw new Error("LLM_BASE_URL not set");
  const res = await fetch(BASE.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature,
      max_tokens,
      messages,
    }),
  });
  if (!res.ok) throw new Error("llm " + res.status);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("empty llm response");
  return out;
}
