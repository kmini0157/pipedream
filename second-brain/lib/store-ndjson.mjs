// Dependency-free vector store: NDJSON on disk + in-memory cosine search.
// Each line is one chunk row:
//   { id, docId, kind, topic, tags[], fav, contentHash, source, title, text, vec, ts }
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = new URL("../data/store.ndjson", import.meta.url).pathname;

let _rows = null;

function ensureFile() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DB_PATH)) appendFileSync(DB_PATH, "");
}

function load() {
  if (_rows) return _rows;
  ensureFile();
  const raw = readFileSync(DB_PATH, "utf8").trim();
  _rows = raw ? raw.split("\n").map((l) => JSON.parse(l)) : [];
  return _rows;
}

function saveAll() {
  writeFileSync(DB_PATH, _rows.map((r) => JSON.stringify(r)).join("\n") + (_rows.length ? "\n" : ""));
}

export function add(rows) {
  load();
  appendFileSync(DB_PATH, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  _rows.push(...rows);
  return rows.length;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // L2-normalized vectors -> dot == cosine
}

function matches(r, f) {
  if (f.topic && r.topic !== f.topic) return false;
  if (f.kind && r.kind !== f.kind) return false;
  if (f.tag && !(r.tags || []).includes(f.tag)) return false;
  if (f.fav && !r.fav) return false;
  if (f.since && !(r.ts >= f.since)) return false;
  if (f.until && !(r.ts <= f.until)) return false;
  return true;
}

export function search(queryVec, k = 5, filters = {}) {
  return load()
    .filter((r) => matches(r, filters))
    .map((r) => ({ ...r, score: cosine(queryVec, r.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ vec, ...rest }) => rest);
}

export function stats() {
  const rows = load();
  return { chunks: rows.length, docs: new Set(rows.map((r) => r.docId)).size };
}

export function topics() {
  const byTopic = new Map();
  for (const r of load()) {
    const t = r.topic || "메모";
    if (!byTopic.has(t)) byTopic.set(t, new Set());
    byTopic.get(t).add(r.docId);
  }
  return [...byTopic.entries()]
    .map(([topic, docs]) => ({ topic, docs: docs.size }))
    .sort((a, b) => b.docs - a.docs);
}

export function tagFacet() {
  const byTag = new Map();
  for (const r of load()) {
    for (const t of r.tags || []) {
      if (!byTag.has(t)) byTag.set(t, new Set());
      byTag.get(t).add(r.docId);
    }
  }
  return [...byTag.entries()]
    .map(([tag, docs]) => ({ tag, docs: docs.size }))
    .sort((a, b) => b.docs - a.docs);
}

export function since(tsIso) {
  return load()
    .filter((r) => r.ts && r.ts >= tsIso)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .map(({ vec, ...rest }) => rest);
}

// ---- document-level operations ----

export function setTags(docId, tags) {
  load();
  let n = 0;
  for (const r of _rows) if (r.docId === docId) { r.tags = tags; n++; }
  if (n) saveAll();
  return n;
}

export function setFav(docId, fav) {
  load();
  let n = 0;
  for (const r of _rows) if (r.docId === docId) { r.fav = fav ? 1 : 0; n++; }
  if (n) saveAll();
  return n;
}

export function deleteDocs(docIds) {
  load();
  const drop = new Set(docIds);
  const before = _rows.length;
  _rows = _rows.filter((r) => !drop.has(r.docId));
  saveAll();
  return before - _rows.length;
}

export function listDocs(filters = {}) {
  const byDoc = new Map();
  for (const r of load()) {
    if (!matches(r, filters)) continue;
    if (!byDoc.has(r.docId)) {
      byDoc.set(r.docId, {
        docId: r.docId, title: r.title, source: r.source, topic: r.topic,
        kind: r.kind, tags: r.tags || [], fav: r.fav || 0, ts: r.ts, chunks: 0,
      });
    }
    byDoc.get(r.docId).chunks++;
  }
  return [...byDoc.values()].sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

// One centroid vector per doc (mean of chunk vecs, renormalized) for dedup.
export function docCentroids() {
  const byDoc = new Map();
  for (const r of load()) {
    if (!byDoc.has(r.docId)) {
      byDoc.set(r.docId, {
        docId: r.docId, title: r.title, ts: r.ts, contentHash: r.contentHash || null,
        tags: r.tags || [], fav: r.fav || 0, chunks: 0, sum: new Array(r.vec.length).fill(0),
      });
    }
    const d = byDoc.get(r.docId);
    for (let i = 0; i < r.vec.length; i++) d.sum[i] += r.vec[i];
    d.chunks++;
  }
  return [...byDoc.values()].map((d) => {
    let norm = 0;
    for (const v of d.sum) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    const { sum, ...rest } = d;
    return { ...rest, vec: sum.map((v) => v / norm) };
  });
}
