// Collector: fetch each watch, find items not seen before, ingest them.
import { embed } from "./embed.mjs";
import { add } from "./store.mjs";
import { chunk, fetchUrlText } from "./ingest.mjs";
import { parseFeed } from "./feedparse.mjs";
import { markSeen, getRaw } from "./feeds.mjs";

const itemKey = (it) => (it.guid || it.link || it.title || "").slice(0, 200);

// Turn fresh feed items into store rows (chunk + embed + persist).
export async function ingestItems(watch, items) {
  const fresh = [];
  for (const it of items) {
    const text = [it.title, it.body].filter(Boolean).join("\n\n").trim();
    if (!text) continue;
    const chunks = chunk(text);
    const vecs = await embed(chunks);
    const docId = "f" + Math.abs(hash(itemKey(it)));
    await add(
      chunks.map((c, i) => ({
        id: `${docId}-${i}`,
        docId,
        kind: "feed",
        topic: watch.topic,
        source: it.link || watch.url,
        title: it.title || watch.topic,
        text: c,
        ts: new Date().toISOString(),
        vec: vecs[i],
      })),
    );
    fresh.push(it);
  }
  return fresh;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// Offline-testable core: given xml, ingest only the unseen items.
export async function collectFromXml(watch, xml) {
  const items = parseFeed(xml);
  const seen = new Set(watch.seen || []);
  const unseen = items.filter((it) => !seen.has(itemKey(it)));
  const ingested = await ingestItems(watch, unseen);
  markSeen(watch.id, items.map(itemKey));
  return { found: items.length, new: ingested.length, items: ingested };
}

// Network path: fetch the watch then delegate to the offline core.
export async function collectWatch(watch) {
  if (watch.type === "rss") {
    const res = await fetch(watch.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!res.ok) throw new Error(`feed ${res.status} ${watch.url}`);
    return collectFromXml(watch, await res.text());
  }
  // Plain page: re-fetch via Jina, treat as a single item keyed by content hash.
  const { text, title } = await fetchUrlText(watch.url);
  const item = { title, body: text, link: watch.url, guid: watch.url + ":" + hash(text) };
  const seen = new Set(watch.seen || []);
  const unseen = seen.has(itemKey(item)) ? [] : [item];
  const ingested = await ingestItems(watch, unseen);
  markSeen(watch.id, [itemKey(item)]);
  return { found: 1, new: ingested.length, items: ingested };
}

export async function collectAll() {
  const watches = getRaw();
  const results = [];
  for (const w of watches) {
    try {
      results.push({ topic: w.topic, ...(await collectWatch(w)) });
    } catch (e) {
      results.push({ topic: w.topic, error: String(e.message || e) });
    }
  }
  return results;
}
