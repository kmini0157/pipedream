// Zero-dependency HTTP server (Node built-ins) wiring ingest + embed + store.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { embed, embedOne } from "./lib/embed.mjs";
import { search, stats, topics, tagFacet, setTags, setFav, listDocs } from "./lib/store.mjs";
import * as feeds from "./lib/feeds.mjs";
import { collectAll } from "./lib/collect.mjs";
import { buildDigest } from "./lib/digest.mjs";
import { storeDoc, storeUrl } from "./lib/pipeline.mjs";
import { extractText } from "./lib/extract.mjs";
import { findDuplicates, merge } from "./lib/dedup.mjs";

const PORT = process.env.PORT || 8787;
const PUBLIC = new URL("./public/", import.meta.url).pathname;

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(data);
}

function readText(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function readBody(req) {
  const raw = await readText(req);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    throw e;
  }
}

async function handleIngest(req, res) {
  const { url, text, title, topic, tags } = await readBody(req);
  const result = url
    ? await storeUrl(url, { title, topic, tags })
    : await storeDoc({ text, title, topic, tags, kind: "note" });
  json(res, 200, { ok: true, ...result });
}

// File upload: raw bytes in body, ?name=foo.md for the filename.
async function handleIngestFile(req, res) {
  const name = new URL(req.url, "http://x").searchParams.get("name") || "upload.txt";
  const content = await readText(req);
  const { title, text } = extractText(name, content);
  const result = await storeDoc({ text, title, source: name, kind: "file" });
  json(res, 200, { ok: true, ...result });
}

// One-click clip (bookmarklet target): GET /clip?text=&title= or ?url=
async function handleClip(req, res) {
  const q = new URL(req.url, "http://x").searchParams;
  try {
    const result = q.get("url")
      ? await storeUrl(q.get("url"), { title: q.get("title") || undefined })
      : await storeDoc({ text: q.get("text"), title: q.get("title") || "클립", kind: "clip" });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:40px">
      ✅ 저장됨: <b>${result.title}</b> (${result.chunks} chunks)<br><br>
      <a href="javascript:history.back()">← 돌아가기</a></body>`);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<meta charset=utf-8>✗ ${e.message}`);
  }
}

async function handleSearch(req, res) {
  const { query, k, topic, since, until, kind, tag, fav } = await readBody(req);
  if (!query) return json(res, 400, { error: "query required" });
  const qv = await embedOne(query);
  const filters = {};
  if (topic) filters.topic = topic;
  if (kind) filters.kind = kind;
  if (tag) filters.tag = tag;
  if (fav) filters.fav = 1;
  if (since) filters.since = since;
  if (until) filters.until = until;
  const hits = await search(qv, k || 5, filters);
  json(res, 200, { query, filters, hits });
}

// Document-level metadata + dedup endpoints.
async function handleTag(req, res) {
  const { docId, tags } = await readBody(req);
  if (!docId || !Array.isArray(tags)) return json(res, 400, { error: "docId and tags[] required" });
  if (tags.length > 100) return json(res, 400, { error: "too many tags (max 100)" });
  const clean = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 100);
  const n = await setTags(docId, clean);
  if (n === 0) return json(res, 404, { error: "docId not found" });
  json(res, 200, { ok: true, updated: n });
}

async function handleFav(req, res) {
  const { docId, fav } = await readBody(req);
  if (!docId) return json(res, 400, { error: "docId required" });
  const n = await setFav(docId, !!fav);
  if (n === 0) return json(res, 404, { error: "docId not found" });
  json(res, 200, { ok: true, updated: n, fav: !!fav });
}

async function handleDocs(req, res) {
  const q = new URL(req.url, "http://x").searchParams;
  const filters = {};
  if (q.get("tag")) filters.tag = q.get("tag");
  if (q.get("topic")) filters.topic = q.get("topic");
  if (q.get("fav")) filters.fav = 1;
  json(res, 200, { docs: await listDocs(filters) });
}

async function handleDuplicates(req, res) {
  const t = Number(new URL(req.url, "http://x").searchParams.get("threshold") || 0.92);
  json(res, 200, { threshold: t, groups: await findDuplicates(t) });
}

async function handleMerge(req, res) {
  const { keepDocId, dropDocIds } = await readBody(req);
  if (!keepDocId || !Array.isArray(dropDocIds)) return json(res, 400, { error: "keepDocId and dropDocIds[] required" });
  if (dropDocIds.includes(keepDocId)) return json(res, 400, { error: "keepDocId must not be in dropDocIds" });
  const result = await merge(keepDocId, dropDocIds);
  if (result.kept === 0) return json(res, 404, { error: "keepDocId not found" });
  json(res, 200, { ok: true, ...result });
}

async function handleWatches(req, res) {
  if (req.method === "GET") return json(res, 200, { watches: feeds.list() });
  if (req.method === "POST") {
    const { topic, url, type } = await readBody(req);
    if (!url) return json(res, 400, { error: "url required" });
    return json(res, 200, { ok: true, watch: feeds.add({ topic, url, type }) });
  }
  if (req.method === "DELETE") {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    return json(res, 200, { removed: feeds.remove(id) });
  }
  return json(res, 405, { error: "method" });
}

async function handleCollect(req, res) {
  const results = await collectAll();
  const total = results.reduce((n, r) => n + (r.new || 0), 0);
  json(res, 200, { ok: true, total, results });
}

async function handleDigest(req, res) {
  const hours = Number(new URL(req.url, "http://x").searchParams.get("hours") || 24);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  json(res, 200, await buildDigest(cutoff, new Date().toISOString().slice(0, 10)));
}

async function serveStatic(req, res) {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const data = await readFile(PUBLIC + path.replace(/^\//, ""));
    const ext = path.split(".").pop();
    const type =
      { html: "text/html", js: "text/javascript", css: "text/css" }[ext] ||
      "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "POST" && req.url === "/ingest") return handleIngest(req, res);
    if (req.method === "POST" && req.url.startsWith("/ingest-file")) return handleIngestFile(req, res);
    if (req.method === "GET" && req.url.startsWith("/clip")) return handleClip(req, res);
    if (req.method === "POST" && req.url === "/search") return handleSearch(req, res);
    if (req.method === "GET" && req.url === "/stats") return json(res, 200, await stats());
    if (req.method === "GET" && req.url === "/topics") return json(res, 200, { topics: await topics() });
    if (req.method === "GET" && req.url === "/tags") return json(res, 200, { tags: await tagFacet() });
    if (req.method === "POST" && req.url === "/tag") return handleTag(req, res);
    if (req.method === "POST" && req.url === "/fav") return handleFav(req, res);
    if (req.method === "GET" && req.url.startsWith("/docs")) return handleDocs(req, res);
    if (req.method === "GET" && req.url.startsWith("/duplicates")) return handleDuplicates(req, res);
    if (req.method === "POST" && req.url === "/merge") return handleMerge(req, res);
    if (req.url.startsWith("/watches")) return handleWatches(req, res);
    if (req.method === "POST" && req.url === "/collect") return handleCollect(req, res);
    if (req.method === "GET" && req.url.startsWith("/digest")) return handleDigest(req, res);
    return serveStatic(req, res);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`🧠 second-brain on http://localhost:${PORT}`);
});
