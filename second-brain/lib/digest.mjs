// Build a daily digest from everything ingested since a cutoff.
// Summaries are extractive (keyless, offline). Swap in an LLM later if wanted.
import { since } from "./store.mjs";

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

export function buildDigest(sinceIso, dateLabel) {
  const rows = since(sinceIso);
  const docs = groupDocs(rows);

  const byTopic = new Map();
  for (const d of docs) {
    const t = d.topic || "메모";
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t).push({
      title: d.title,
      source: d.source,
      summary: extractive(d.parts.join(" ")),
    });
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
