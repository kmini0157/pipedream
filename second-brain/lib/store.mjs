// Pluggable vector store façade. STORE=ndjson (default) | libsql.
//   ndjson — zero-dependency NDJSON file, single machine.
//   libsql — libSQL/Turso with a native vector index (local file: or remote).
// All methods are async so either adapter (sync or async) works behind one API.
const STORE = process.env.STORE || "ndjson";

let _adapter = null;
async function adapter() {
  if (!_adapter) {
    _adapter =
      STORE === "libsql"
        ? await import("./store-libsql.mjs")
        : await import("./store-ndjson.mjs");
  }
  return _adapter;
}

export async function add(rows) {
  return (await adapter()).add(rows);
}
export async function search(queryVec, k = 5, filters = {}) {
  if (!Array.isArray(queryVec) || !queryVec.length) {
    throw new Error("query vector must be a non-empty array");
  }
  k = Math.max(1, Math.min(1000, Math.floor(k) || 5));
  return (await adapter()).search(queryVec, k, filters);
}
export async function stats() {
  return (await adapter()).stats();
}
export async function topics() {
  return (await adapter()).topics();
}
export async function tagFacet() {
  return (await adapter()).tagFacet();
}
export async function since(tsIso) {
  return (await adapter()).since(tsIso);
}
export async function setTags(docId, tags) {
  return (await adapter()).setTags(docId, tags);
}
export async function setFav(docId, fav) {
  return (await adapter()).setFav(docId, fav);
}
export async function deleteDocs(docIds) {
  return (await adapter()).deleteDocs(docIds);
}
export async function listDocs(filters = {}) {
  return (await adapter()).listDocs(filters);
}
export async function docCentroids() {
  return (await adapter()).docCentroids();
}
export async function telemetry() {
  const a = await adapter();
  return a.telemetry ? a.telemetry() : { backend: STORE };
}
export const backend = STORE;
