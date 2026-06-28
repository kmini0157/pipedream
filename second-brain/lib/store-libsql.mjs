// libSQL / Turso adapter with NATIVE vector index (F32_BLOB + vector_top_k),
// falling back to JS cosine if the native path is unavailable.
//   STORE=libsql LIBSQL_URL=file:data/store.db            (local, offline)
//   STORE=libsql LIBSQL_URL=libsql://xxx.turso.io LIBSQL_AUTH_TOKEN=...  (remote)
import { createClient } from "@libsql/client";

const DIM = 384; // all-MiniLM-L6-v2 and the hashing fallback both emit 384-dim
const url = process.env.LIBSQL_URL || "file:data/store.db";
const authToken = process.env.LIBSQL_AUTH_TOKEN;

let _client = null;
let _ready = null;
let _native = true; // flips to false if the vector index can't be used

function client() {
  if (!_client) _client = createClient({ url, authToken });
  return _client;
}

async function ready() {
  if (_ready) return _ready;
  _ready = (async () => {
    const c = client();
    await c.execute(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        docId TEXT, kind TEXT, topic TEXT,
        tags TEXT, fav INTEGER DEFAULT 0, contentHash TEXT,
        source TEXT, title TEXT, text TEXT,
        ts TEXT, vec TEXT, emb F32_BLOB(${DIM})
      )`);
    // best-effort upgrades for older DBs (ignore "duplicate column")
    for (const col of [
      "tags TEXT", "fav INTEGER DEFAULT 0", "contentHash TEXT", `emb F32_BLOB(${DIM})`,
    ]) {
      try { await c.execute(`ALTER TABLE chunks ADD COLUMN ${col}`); } catch {}
    }
    await c.execute("CREATE INDEX IF NOT EXISTS idx_chunks_ts ON chunks(ts)");
    await c.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(docId)");
    try {
      await c.execute("CREATE INDEX IF NOT EXISTS chunks_vidx ON chunks(libsql_vector_idx(emb))");
    } catch {
      _native = false; // build lacks native vector support
    }
  })();
  return _ready;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

const vjson = (vec) => JSON.stringify(vec);

export async function add(rows) {
  await ready();
  const stmts = rows.map((r) => ({
    sql: `INSERT OR REPLACE INTO chunks
            (id, docId, kind, topic, tags, fav, contentHash, source, title, text, ts, vec, emb)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?))`,
    args: [
      r.id, r.docId, r.kind || null, r.topic || null,
      JSON.stringify(r.tags || []), r.fav ? 1 : 0, r.contentHash || null,
      r.source || null, r.title || null, r.text || null,
      r.ts || null, vjson(r.vec), vjson(r.vec),
    ],
  }));
  await client().batch(stmts, "write");
  return rows.length;
}

// Build a WHERE clause + args from filters (shared by search & listDocs).
function buildWhere(f = {}, table = "chunks") {
  const where = [];
  const args = [];
  if (f.topic) { where.push(`${table}.topic = ?`); args.push(f.topic); }
  if (f.kind) { where.push(`${table}.kind = ?`); args.push(f.kind); }
  if (f.fav) { where.push(`${table}.fav = 1`); }
  if (f.since) { where.push(`${table}.ts >= ?`); args.push(f.since); }
  if (f.until) { where.push(`${table}.ts <= ?`); args.push(f.until); }
  if (f.tag) {
    where.push(`EXISTS (SELECT 1 FROM json_each(${table}.tags) je WHERE je.value = ?)`);
    args.push(f.tag);
  }
  return { clause: where.length ? " WHERE " + where.join(" AND ") : "", args };
}

const strip = ({ vec, emb, dist, ...rest }) => rest;

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// Exhaustive JS-cosine search (filter in SQL, score in JS). Used as the
// fallback and to backfill when the native ANN path is pruned below k.
async function jsSearch(queryVec, k, filters) {
  const { clause, args } = buildWhere(filters);
  const { rows } = await client().execute({ sql: `SELECT * FROM chunks${clause}`, args });
  return rows
    .map((r) => {
      const v = safeParse(r.vec, null);
      return v ? { ...r, score: cosine(queryVec, v) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(strip);
}

export async function search(queryVec, k = 5, filters = {}) {
  await ready();
  if (!Array.isArray(queryVec) || queryVec.length !== DIM) {
    throw new Error(`query vector must be a ${DIM}-dim array (got ${Array.isArray(queryVec) ? queryVec.length : typeof queryVec})`);
  }
  k = Math.max(1, Math.min(1000, Math.floor(k) || 5));
  const c = client();
  const hasFilters = Object.keys(filters).length > 0;

  if (_native) {
    try {
      // Over-fetch candidates when filtering, since the WHERE prunes ANN hits.
      const topk = hasFilters ? Math.max(k * 16, 64) : k;
      const { clause, args } = buildWhere(filters);
      const sql =
        `SELECT chunks.*, vector_distance_cos(chunks.emb, vector32(?)) AS dist
           FROM vector_top_k('chunks_vidx', vector32(?), ?) AS t
           JOIN chunks ON chunks.rowid = t.id${clause}
          ORDER BY dist LIMIT ?`;
      const { rows } = await c.execute({
        sql,
        args: [vjson(queryVec), vjson(queryVec), topk, ...args, k],
      });
      // If filters pruned the ANN candidates below k, backfill with an
      // exhaustive scan so we still return up to k results (parity w/ ndjson).
      if (!(hasFilters && rows.length < k)) {
        return rows.map((r) => ({ ...strip(r), score: 1 - Number(r.dist) }));
      }
    } catch (e) {
      console.warn("[second-brain] native vector path failed, using JS cosine:", e.message);
      _native = false; // degrade for subsequent calls too
    }
  }

  return jsSearch(queryVec, k, filters);
}

export async function stats() {
  await ready();
  const { rows } = await client().execute(
    "SELECT COUNT(*) AS chunks, COUNT(DISTINCT docId) AS docs FROM chunks",
  );
  return { chunks: Number(rows[0].chunks), docs: Number(rows[0].docs) };
}

export async function topics() {
  await ready();
  const { rows } = await client().execute(
    `SELECT COALESCE(topic,'메모') AS topic, COUNT(DISTINCT docId) AS docs
       FROM chunks GROUP BY COALESCE(topic,'메모') ORDER BY docs DESC`,
  );
  return rows.map((r) => ({ topic: r.topic, docs: Number(r.docs) }));
}

export async function tagFacet() {
  await ready();
  const { rows } = await client().execute(
    `SELECT je.value AS tag, COUNT(DISTINCT chunks.docId) AS docs
       FROM chunks, json_each(chunks.tags) je
      GROUP BY je.value ORDER BY docs DESC`,
  );
  return rows.map((r) => ({ tag: r.tag, docs: Number(r.docs) }));
}

export async function since(tsIso) {
  await ready();
  const { rows } = await client().execute({
    sql: "SELECT * FROM chunks WHERE ts >= ? ORDER BY ts DESC",
    args: [tsIso],
  });
  return rows.map(strip);
}

export async function setTags(docId, tags) {
  await ready();
  const r = await client().execute({
    sql: "UPDATE chunks SET tags = ? WHERE docId = ?",
    args: [JSON.stringify(tags), docId],
  });
  return r.rowsAffected;
}

export async function setFav(docId, fav) {
  await ready();
  const r = await client().execute({
    sql: "UPDATE chunks SET fav = ? WHERE docId = ?",
    args: [fav ? 1 : 0, docId],
  });
  return r.rowsAffected;
}

export async function deleteDocs(docIds) {
  await ready();
  if (!docIds.length) return 0;
  const placeholders = docIds.map(() => "?").join(",");
  const r = await client().execute({
    sql: `DELETE FROM chunks WHERE docId IN (${placeholders})`,
    args: docIds,
  });
  return r.rowsAffected;
}

export async function listDocs(filters = {}) {
  await ready();
  const { clause, args } = buildWhere(filters);
  const { rows } = await client().execute({
    sql: `SELECT docId, title, source, topic, kind, tags, fav,
                 MAX(ts) AS ts, COUNT(*) AS chunks
            FROM chunks${clause}
           GROUP BY docId ORDER BY ts DESC`,
    args,
  });
  return rows.map((r) => ({
    docId: r.docId, title: r.title, source: r.source, topic: r.topic, kind: r.kind,
    tags: safeParse(r.tags, []), fav: Number(r.fav || 0),
    ts: r.ts, chunks: Number(r.chunks),
  }));
}

export async function docCentroids() {
  await ready();
  const { rows } = await client().execute(
    "SELECT docId, title, ts, contentHash, tags, fav, vec FROM chunks",
  );
  const byDoc = new Map();
  for (const r of rows) {
    const v = safeParse(r.vec, null);
    if (!v) continue; // skip rows with corrupted vectors instead of crashing
    if (!byDoc.has(r.docId)) {
      byDoc.set(r.docId, {
        docId: r.docId, title: r.title, ts: r.ts, contentHash: r.contentHash || null,
        tags: safeParse(r.tags, []), fav: Number(r.fav || 0), chunks: 0,
        sum: new Array(v.length).fill(0),
      });
    }
    const d = byDoc.get(r.docId);
    for (let i = 0; i < v.length; i++) d.sum[i] += v[i];
    d.chunks++;
  }
  return [...byDoc.values()].map((d) => {
    let norm = 0;
    for (const x of d.sum) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    const { sum, ...rest } = d;
    return { ...rest, vec: sum.map((x) => x / norm) };
  });
}
