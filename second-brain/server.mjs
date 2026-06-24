// Zero-dependency HTTP server (Node built-ins) wiring ingest + embed + store.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { embed, embedOne } from "./lib/embed.mjs";
import { add, search, stats } from "./lib/store.mjs";
import { fetchUrlText, chunk } from "./lib/ingest.mjs";

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

let docCounter = Date.now();

async function handleIngest(req, res) {
  const { url, text, title } = await readBody(req);
  let body = text;
  let docTitle = title;
  let source = title || "note";

  if (url) {
    const fetched = await fetchUrlText(url);
    body = fetched.text;
    docTitle = title || fetched.title;
    source = url;
  }
  if (!body || !body.trim()) return json(res, 400, { error: "url or text required" });

  const docId = "d" + ++docCounter;
  const chunks = chunk(body);
  const vecs = await embed(chunks);
  const rows = chunks.map((text, i) => ({
    id: `${docId}-${i}`,
    docId,
    source,
    title: docTitle || source,
    text,
    vec: vecs[i],
    ts: new Date().toISOString(),
  }));
  add(rows);
  json(res, 200, { ok: true, docId, title: docTitle, chunks: rows.length });
}

async function handleSearch(req, res) {
  const { query, k } = await readBody(req);
  if (!query) return json(res, 400, { error: "query required" });
  const qv = await embedOne(query);
  const hits = search(qv, k || 5);
  json(res, 200, { query, hits });
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
    if (req.method === "POST" && req.url === "/search") return handleSearch(req, res);
    if (req.method === "GET" && req.url === "/stats") return json(res, 200, stats());
    return serveStatic(req, res);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`🧠 second-brain on http://localhost:${PORT}`);
});
