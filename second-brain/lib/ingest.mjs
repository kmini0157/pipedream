// Ingestion: pull clean text from a URL via Jina Reader (keyless) or take raw text,
// then split into overlapping chunks ready for embedding.

const JINA_READER = "https://r.jina.ai/";

export async function fetchUrlText(url) {
  // r.jina.ai returns LLM-friendly markdown for any page, no API key required.
  const res = await fetch(JINA_READER + url, {
    headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
  });
  if (!res.ok) throw new Error(`Jina Reader ${res.status} for ${url}`);
  const text = await res.text();
  // First markdown heading (if any) makes a decent title.
  const titleMatch = text.match(/^#\s+(.+)$/m) || text.match(/^Title:\s*(.+)$/m);
  return { text, title: titleMatch ? titleMatch[1].trim() : url };
}

// ~800 char chunks with 120 char overlap, split on paragraph boundaries first.
export function chunk(text, size = 800, overlap = 120) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const paras = clean.split(/\n\n+/);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > size && buf) {
      chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - overlap));
    }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf.trim()) chunks.push(buf.trim());
  // Hard-split any oversized chunk (e.g. a single huge paragraph).
  return chunks.flatMap((c) => {
    if (c.length <= size * 1.5) return [c];
    const parts = [];
    for (let i = 0; i < c.length; i += size - overlap) {
      parts.push(c.slice(i, i + size));
    }
    return parts;
  });
}
