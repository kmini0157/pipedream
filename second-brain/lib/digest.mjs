// Build a daily digest from everything ingested since a cutoff.
// Summaries default to extractive (keyless, offline); set SUMMARY=llm with an
// OpenAI-compatible endpoint (Groq/OpenRouter free tiers, local, etc.) for
// fluent prose. The LLM path falls back to extractive on any error.
import { since } from "./store.mjs";

// Returns an async (text) => summary. Picks LLM or extractive once per build.
function makeSummarizer() {
  const useLLM = (process.env.SUMMARY || "extractive") === "llm" && process.env.LLM_BASE_URL;
  if (!useLLM) return async (text) => extractive(text);
  return async (text) => {
    try {
      return await summarizeLLM(text);
    } catch {
      return extractive(text); // graceful fallback keeps the digest flowing
    }
  };
}

async function summarizeLLM(text) {
  const base = process.env.LLM_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        { role: "system", content: "너는 한국어 뉴스 요약가다. 핵심만 1-2문장으로, 군더더기 없이 요약한다." },
        { role: "user", content: `다음 글을 1-2문장으로 요약해줘:\n\n${text.slice(0, 4000)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error("llm " + res.status);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("empty llm response");
  return out;
}

function sentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

// Pick the 1-2 most informative sentences (longest, lightly deduped).
function extractive(text, n = 2) {
  const ss = sentences(text);
  if (ss.length <= n) return ss.join(" ");
  return ss
    .map((s, i) => ({ s, i, score: s.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(" ");
}

// Collapse chunks back into per-document entries.
function groupDocs(rows) {
  const byDoc = new Map();
  for (const r of rows) {
    if (!byDoc.has(r.docId)) {
      byDoc.set(r.docId, { title: r.title, source: r.source, topic: r.topic || "메모", parts: [] });
    }
    byDoc.get(r.docId).parts.push(r.text);
  }
  return [...byDoc.values()];
}

export async function buildDigest(sinceIso, dateLabel) {
  const rows = await since(sinceIso);
  const docs = groupDocs(rows);
  const summarize = makeSummarizer();

  // Summarize entries concurrently (matters for the LLM path).
  const entries = await Promise.all(
    docs.map(async (d) => ({
      topic: d.topic || "메모",
      title: d.title,
      source: d.source,
      summary: await summarize(d.parts.join(" ")),
    })),
  );

  const byTopic = new Map();
  for (const e of entries) {
    if (!byTopic.has(e.topic)) byTopic.set(e.topic, []);
    byTopic.get(e.topic).push(e);
  }

  const lines = [`# 🧠 오늘의 다이제스트 — ${dateLabel}`, ""];
  if (!docs.length) {
    lines.push("_새로 들어온 내용이 없습니다._");
  } else {
    lines.push(`새 항목 **${docs.length}건** · 주제 ${byTopic.size}개`, "");
    for (const [topic, entries] of byTopic) {
      lines.push(`## ${topic}`);
      for (const e of entries) {
        const link = e.source && /^https?:/.test(e.source) ? ` ([원문](${e.source}))` : "";
        lines.push(`- **${e.title}**${link}`);
        if (e.summary) lines.push(`  ${e.summary}`);
      }
      lines.push("");
    }
  }
  const markdown = lines.join("\n");
  return { count: docs.length, topics: byTopic.size, markdown };
}
