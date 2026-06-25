// libSQL / Turso adapter. Same code path for a local file DB and remote Turso:
//   STORE=libsql LIBSQL_URL=file:data/store.db            (local, offline)
//   STORE=libsql LIBSQL_URL=libsql://xxx.turso.io \
//                LIBSQL_AUTH_TOKEN=...                     (remote, multi-device)
//
// Vectors are stored as JSON text and cosine is computed in JS so the store
// stays portable. For large corpora, switch to libSQL native vector indexes.
import { createClient } from "@libsql/client";

const url = process.env.LIBSQL_URL || "file:data/store.db";
const authToken = process.env.LIBSQL_AUTH_TOKEN;

let _client = null;
let _ready = null;

function client() {
  if (!_client) _client = createClient({ url, authToken });
  return _client;
}

function ready() {
  if (!_ready) {
    _ready = client().execute(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        docId TEXT, kind TEXT, topic TEXT,
        source TEXT, title TEXT, text TEXT,
        ts TEXT, vec TEXT
      )`).then(() =>
      client().execute(`CREATE INDEX IF NOT EXISTS idx_chunks_ts ON chunks(ts)`),
    );
  }
  return _ready;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // L2-normalized vectors -> dot == cosine
}

export async function add(rows) {
  await ready();
  const stmts = rows.map((r) => ({
    sql: `INSERT OR REPLACE INTO chunks
            (id, docId, kind, topic, source, title, text, ts, vec)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r.id, r.docId, r.kind || null, r.topic || null,
      r.source || null, r.title || null, r.text || null,
      r.ts || null, JSON.stringify(r.vec),
    ],
  }));
  await client().batch(stmts, "write");
  return rows.length;
}

export async function search(queryVec, k = 5) {
  await ready();
  const { rows } = await client().execute("SELECT * FROM chunks");
  return rows
    .map((r) => ({ ...r, score: cosine(queryVec, JSON.parse(r.vec)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ vec, score, ...rest }) => ({ ...rest, score }));
}

export async function stats() {
  await ready();
  const { rows } = await client().execute(
    "SELECT COUNT(*) AS chunks, COUNT(DISTINCT docId) AS docs FROM chunks",
  );
  return { chunks: Number(rows[0].chunks), docs: Number(rows[0].docs) };
}

export async function since(tsIso) {
  await ready();
  const { rows } = await client().execute({
    sql: "SELECT * FROM chunks WHERE ts >= ? ORDER BY ts DESC",
    args: [tsIso],
  });
  return rows.map(({ vec, ...rest }) => rest);
}
