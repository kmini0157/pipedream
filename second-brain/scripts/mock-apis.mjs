// Local mock of the external provider APIs (Jina embeddings/rerank, Tavily,
// YouTube watch+timedtext, OpenAI-compatible chat) so the integrations can be
// exercised end-to-end without network. Fixed port (MOCK_PORT, default 8899).
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 8899);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DIM = 384;

// Deterministic 384-dim bag-of-words embedding (shared token hashing) so query
// and passage vectors are comparable — retrieval behaves sensibly in tests.
function emb(text) {
  const v = new Float64Array(DIM);
  for (const t of (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % DIM] += 1;
  }
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}
const toks = (s) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));

function body(req) {
  return new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
}
const send = (res, code, obj, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const path = url.pathname;

  if (path === "/v1/embeddings") {
    const { input } = JSON.parse((await body(req)) || "{}");
    const arr = Array.isArray(input) ? input : [input];
    return send(res, 200, { data: arr.map((t, i) => ({ index: i, embedding: emb(t) })) });
  }

  if (path === "/v1/rerank") {
    const { query, documents, top_n } = JSON.parse((await body(req)) || "{}");
    const q = toks(query);
    const scored = documents.map((d, i) => {
      const dt = toks(d); let overlap = 0; for (const t of q) if (dt.has(t)) overlap++;
      return { index: i, relevance_score: overlap / (q.size || 1) };
    }).sort((a, b) => b.relevance_score - a.relevance_score).slice(0, top_n || documents.length);
    return send(res, 200, { results: scored });
  }

  if (path === "/tavily/search") {
    const { query } = JSON.parse((await body(req)) || "{}");
    return send(res, 200, {
      results: [
        { title: `${query} — 결과 1`, url: `${ORIGIN}/page/1`, content: `${query}에 대한 첫 번째 발췌 내용.` },
        { title: `${query} — 결과 2`, url: `${ORIGIN}/page/2`, content: `${query} 관련 두 번째 발췌.` },
      ],
    });
  }

  // YouTube watch page with a caption track pointing back at /timedtext.
  if (path === "/watch") {
    const v = url.searchParams.get("v") || "x";
    const tt = `${ORIGIN}/timedtext?v=${v}`;
    return send(res, 200,
      `<html><head><title>목 영상 ${v} - YouTube</title></head><body>` +
      `<script>var x = {"captionTracks":[{"languageCode":"ko","baseUrl":"${tt}"}]};</script>` +
      `</body></html>`, "text/html");
  }
  if (path === "/timedtext") {
    return send(res, 200,
      `<?xml version="1.0"?><transcript>` +
      `<text start="0" dur="3">안녕하세요 이 영상은 무료 GPU에 대한 내용입니다</text>` +
      `<text start="3" dur="3">Kaggle과 ZeroGPU를 소개합니다</text>` +
      `</transcript>`, "text/xml");
  }

  if (path === "/chat/completions") {
    const { messages } = JSON.parse((await body(req)) || "{}");
    const user = messages?.find((m) => m.role === "user")?.content || "";
    const ref = /\[1\]/.test(user) || /\[1\]/.test(JSON.stringify(messages)) ? " [1]" : "";
    return send(res, 200, { choices: [{ message: { role: "assistant", content: `[MOCK] 발췌 근거 답변입니다${ref}` } }] });
  }

  send(res, 404, { error: "no mock for " + path });
});

server.listen(PORT, () => console.log(`mock-apis on ${ORIGIN}`));
