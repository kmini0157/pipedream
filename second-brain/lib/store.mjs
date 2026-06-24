// Dependency-free vector store: NDJSON on disk + in-memory cosine search.
// Each line is one chunk: { id, docId, source, title, text, vec, ts }
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
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

export function add(rows) {
  load();
  const lines = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  appendFileSync(DB_PATH, lines);
  _rows.push(...rows);
  return rows.length;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized, so dot product == cosine similarity
}

export function search(queryVec, k = 5) {
  const rows = load();
  return rows
    .map((r) => ({ ...r, score: cosine(queryVec, r.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ vec, ...rest }) => rest); // drop heavy vector from response
}

export function stats() {
  const rows = load();
  const docs = new Set(rows.map((r) => r.docId));
  return { chunks: rows.length, docs: docs.size };
}

// Rows added at/after an ISO timestamp (vectors stripped), newest first.
export function since(tsIso) {
  const rows = load();
  return rows
    .filter((r) => r.ts && r.ts >= tsIso)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .map(({ vec, ...rest }) => rest);
}
