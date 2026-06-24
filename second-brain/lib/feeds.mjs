// Watch (구독) management: a small NDJSON of subscriptions the collector polls.
// Each watch: { id, topic, type: 'rss'|'url', url, seen: string[], ts }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PATH = new URL("../data/watches.ndjson", import.meta.url).pathname;
const SEEN_CAP = 300;

function ensure() {
  const dir = dirname(PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(PATH)) writeFileSync(PATH, "");
}

function loadAll() {
  ensure();
  const raw = readFileSync(PATH, "utf8").trim();
  return raw ? raw.split("\n").map((l) => JSON.parse(l)) : [];
}

function saveAll(rows) {
  ensure();
  writeFileSync(PATH, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

export function list() {
  return loadAll().map(({ seen, ...rest }) => ({ ...rest, seenCount: seen?.length || 0 }));
}

export function add({ topic, url, type }) {
  const rows = loadAll();
  const id = "w" + (rows.length + 1) + "-" + url.replace(/\W+/g, "").slice(-8);
  const watch = {
    id,
    topic: topic || url,
    type: type || (url.match(/(rss|atom|feed|\.xml)(\?|$)/i) ? "rss" : "url"),
    url,
    seen: [],
    ts: new Date().toISOString(),
  };
  rows.push(watch);
  saveAll(rows);
  return { ...watch, seen: undefined };
}

export function remove(id) {
  const rows = loadAll();
  const next = rows.filter((r) => r.id !== id);
  saveAll(next);
  return rows.length - next.length;
}

export function getRaw() {
  return loadAll();
}

// Mark item keys as seen for a watch, trimming to the cap. Returns the watch.
export function markSeen(id, keys) {
  const rows = loadAll();
  const w = rows.find((r) => r.id === id);
  if (!w) return null;
  const set = new Set([...(w.seen || []), ...keys]);
  w.seen = [...set].slice(-SEEN_CAP);
  saveAll(rows);
  return w;
}
