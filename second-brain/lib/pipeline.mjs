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

export async function storeDoc({ text, title, source, topic, kind = "note" }) {
  if (!text || !text.trim()) throw new Error("empty text");
  const docId = newDocId();
  const chunks = chunk(text);
  const vecs = await embed(chunks);
  const rows = chunks.map((c, i) => ({
    id: `${docId}-${i}`,
    docId,
    kind,
    topic: topic || null,
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
export async function storeUrl(url, { title, topic } = {}) {
  const fetched = await fetchUrlText(url);
  return storeDoc({ text: fetched.text, title: title || fetched.title, source: url, topic, kind: "web" });
}
