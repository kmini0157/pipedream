// Pluggable vector store façade. STORE=ndjson (default) | libsql.
//   ndjson — zero-dependency NDJSON file, single machine.
//   libsql — libSQL/Turso (local file: URL or remote libsql:// for multi-device).
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
  return (await adapter()).search(queryVec, k, filters);
}
export async function stats() {
  return (await adapter()).stats();
}
export async function topics() {
  return (await adapter()).topics();
}
export async function since(tsIso) {
  return (await adapter()).since(tsIso);
}
export const backend = STORE;
