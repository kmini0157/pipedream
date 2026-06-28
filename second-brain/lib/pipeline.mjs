// Shared ingest pipeline: chunk -> embed -> persist. Used by every input
// channel (manual note, URL, file upload, quick-clip, voice memo).
import { embed } from "./embed.mjs";
import { add } from "./store.mjs";
import { chunk, fetchUrlText } from "./ingest.mjs";

let _seq = 0;
function newDocId() {
  _seq = (_seq + 1) % 1000;
  return "d" + Date.now().toString(36) + _seq.toString(36);
}

// Stable hash of normalized full text, for exact-duplicate detection.
function contentHash(text) {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = (Math.imul(33, h) + norm.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(36) + ":" + norm.length;
}

export async function storeDoc({ text, title, source, topic, kind = "note", tags = [], fav = 0 }) {
  if (!text || !text.trim()) throw new Error("empty text");
  const docId = newDocId();
  const hash = contentHash(text);
  const chunks = chunk(text);
  const vecs = await embed(chunks);
  const rows = chunks.map((c, i) => ({
    id: `${docId}-${i}`,
    docId,
    kind,
    topic: topic || null,
    tags: Array.isArray(tags) ? tags : [],
    fav: fav ? 1 : 0,
    contentHash: hash,
    source: source || title || "note",
    title: title || source || "note",
    text: c,
    ts: new Date().toISOString(),
    vec: vecs[i],
  }));
  await add(rows);
  return { docId, title: rows[0].title, chunks: rows.length };
}

// Fetch a URL via Jina (keyless) then store it.
export async function storeUrl(url, { title, topic, tags } = {}) {
  const fetched = await fetchUrlText(url);
  return storeDoc({ text: fetched.text, title: title || fetched.title, source: url, topic, tags, kind: "web" });
}
