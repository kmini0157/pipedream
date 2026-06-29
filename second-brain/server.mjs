// Zero-dependency HTTP server (Node built-ins) wiring ingest + embed + store.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { embed, embedOne } from "./lib/embed.mjs";
import { search, stats, topics, tagFacet, setTags, setFav, listDocs, telemetry, backend } from "./lib/store.mjs";
import * as feeds from "./lib/feeds.mjs";
import { collectAll } from "./lib/collect.mjs";
import { buildDigest } from "./lib/digest.mjs";
import { storeDoc, storeUrl } from "./lib/pipeline.mjs";
import { extractText } from "./lib/extract.mjs";
import { findDuplicates, merge } from "./lib/dedup.mjs";
import { rerank, reranking } from "./lib/rerank.mjs";
import { webSearch, searchEnabled } from "./lib/websearch.mjs";
import { chat, llmEnabled } from "./lib/llm.mjs";

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""; // empty = open (localhost dev)
const PUBLIC = new URL("./public/", import.meta.url).pathname;

// Auth: when AUTH_TOKEN is set, every route except /health and the static
// shell requires the token via Authorization: Bearer, ?token=, or the
// same-origin sb_token cookie (so the UI and bookmarklet work after login).
function authed(req) {
  if (!AUTH_TOKEN) return true;
  const auth = req.headers["authorization"] || "";
  if (auth === `Bearer ${AUTH_TOKEN}`) return true;
  const url = new URL(req.url, "http://x");
  if (url.searchParams.get("token") === AUTH_TOKEN) return true;
  const cookie = req.headers["cookie"] || "";
  const m = cookie.match(/(?:^|;\s*)sb_token=([^;]+)/);
  if (m && decodeURIComponent(m[1]) === AUTH_TOKEN) return true;
  return false;
}

// Open paths even when auth is on: health check + the static shell (which
// prompts for the token client-side and sets the cookie).
function isOpenPath(req) {
  const path = req.url.split("?")[0];
  if (path === "/health") return true;
  if (req.method === "GET" && (path === "/" || path === "/index.html")) return true;
  return false;
}

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

class BadRequest extends Error {}

async function readBody(req) {
  const raw = await readText(req);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new BadRequest("invalid JSON body");
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

function filtersFrom({ topic, kind, tag, fav, since, until }) {
  const f = {};
  if (topic) f.topic = topic;
  if (kind) f.kind = kind;
  if (tag) f.tag = tag;
  if (fav) f.fav = 1;
  if (since) f.since = since;
  if (until) f.until = until;
  return f;
}

// Embed -> (over-fetch + rerank when enabled) -> top-k hits.
async function retrieve(query, k, filters) {
  const qv = await embedOne(query);
  const fetchN = reranking ? Math.max(k * 4, 20) : k;
  const hits = await search(qv, fetchN, filters);
  return reranking ? await rerank(query, hits, k) : hits;
}

async function handleSearch(req, res) {
  const body = await readBody(req);
  if (!body.query) return json(res, 400, { error: "query required" });
  const filters = filtersFrom(body);
  const hits = await retrieve(body.query, body.k || 5, filters);
  json(res, 200, { query: body.query, filters, reranked: reranking, hits });
}

// Live web search; optionally ingest the results into the brain.
async function handleResearch(req, res) {
  if (!searchEnabled) return json(res, 400, { error: "SEARCH_PROVIDER not configured" });
  const { query, max, ingest } = await readBody(req);
  if (!query) return json(res, 400, { error: "query required" });
  const results = await webSearch(query, { max: max || 5 });
  const ingested = [];
  if (ingest) {
    for (const r of results) {
      try {
        ingested.push({ url: r.url, ...(await storeUrl(r.url, { topic: "research" })) });
      } catch (e) {
        ingested.push({ url: r.url, error: String(e.message || e) });
      }
    }
  }
  json(res, 200, { query, results, ingested });
}

// RAG answer: retrieve (with rerank if on) then synthesize a cited answer.
async function handleAsk(req, res) {
  const body = await readBody(req);
  if (!body.query) return json(res, 400, { error: "query required" });
  const hits = await retrieve(body.query, body.k || 6, filtersFrom(body));
  const sources = hits.map((h, i) => ({
    n: i + 1, title: h.title, source: h.source, score: h.rerankScore ?? h.score,
  }));
  if (!hits.length) return json(res, 200, { query: body.query, answer: null, note: "저장된 근거 없음", sources });
  if (!llmEnabled) {
    return json(res, 200, { query: body.query, answer: null, note: "LLM_BASE_URL 미설정 — 출처만 반환", sources, hits });
  }
  const context = hits.map((h, i) => `[${i + 1}] (${h.title})\n${h.text}`).join("\n\n");
  try {
    const answer = await chat(
      [
        { role: "system", content: "아래 발췌만 근거로 한국어로 답하고, 문장 끝에 [번호] 출처를 단다. 근거가 없으면 모른다고 한다." },
        { role: "user", content: `질문: ${body.query}\n\n발췌:\n${context}` },
      ],
      { max_tokens: 600 },
    );
    json(res, 200, { query: body.query, answer, sources });
  } catch (e) {
    json(res, 200, { query: body.query, answer: null, error: String(e.message || e), sources });
  }
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
    const path = (req.url || "/").split("?")[0]; // match on path; tolerate ?token= etc.
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && path === "/health") {
      return json(res, 200, { ok: true, backend });
    }
    if (!isOpenPath(req) && !authed(req)) {
      return json(res, 401, { error: "unauthorized" });
    }
    if (req.method === "POST" && path === "/ingest") return await handleIngest(req, res);
    if (req.method === "POST" && path === "/ingest-file") return await handleIngestFile(req, res);
    if (req.method === "GET" && path === "/clip") return await handleClip(req, res);
    if (req.method === "POST" && path === "/search") return await handleSearch(req, res);
    if (req.method === "POST" && path === "/research") return await handleResearch(req, res);
    if (req.method === "POST" && path === "/ask") return await handleAsk(req, res);
    if (req.method === "GET" && path === "/stats") return json(res, 200, { ...(await stats()), backend });
    if (req.method === "GET" && path === "/telemetry") return json(res, 200, await telemetry());
    if (req.method === "GET" && path === "/topics") return json(res, 200, { topics: await topics() });
    if (req.method === "GET" && path === "/tags") return json(res, 200, { tags: await tagFacet() });
    if (req.method === "POST" && path === "/tag") return await handleTag(req, res);
    if (req.method === "POST" && path === "/fav") return await handleFav(req, res);
    if (req.method === "GET" && path === "/docs") return await handleDocs(req, res);
    if (req.method === "GET" && path === "/duplicates") return await handleDuplicates(req, res);
    if (req.method === "POST" && path === "/merge") return await handleMerge(req, res);
    if (path === "/watches") return await handleWatches(req, res);
    if (req.method === "POST" && path === "/collect") return await handleCollect(req, res);
    if (req.method === "GET" && path === "/digest") return await handleDigest(req, res);
    return await serveStatic(req, res);
  } catch (e) {
    if (e instanceof BadRequest) return json(res, 400, { error: e.message });
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🧠 second-brain on http://${HOST}:${PORT}  (backend=${backend}, auth=${AUTH_TOKEN ? "on" : "off"})`);
});

// Graceful shutdown so platforms (Fly/Render/Docker) can stop us cleanly.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
