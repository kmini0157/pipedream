// Lib-level checks for the external-API integrations, run against the local
// mock (scripts/mock-apis.mjs). Env is set BEFORE importing the libs because
// each reads its provider from process.env at module load.
const M = process.env.MOCK_URL || "http://127.0.0.1:8899";
Object.assign(process.env, {
  EMBED_PROVIDER: "jina", JINA_API_KEY: "x", JINA_EMBED_URL: M + "/v1/embeddings",
  RERANK: "jina", JINA_RERANK_URL: M + "/v1/rerank",
  SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "x", TAVILY_URL: M + "/tavily/search",
  YT_WATCH_URL: M + "/watch",
  LLM_BASE_URL: M, LLM_MODEL: "mock",
});

const ok = (c, m) => { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } };

const { embedOne, DIM } = await import("../lib/embed.mjs");
const { rerank } = await import("../lib/rerank.mjs");
const { webSearch } = await import("../lib/websearch.mjs");
const { isYoutube, fetchYoutubeTranscript, videoId } = await import("../lib/youtube.mjs");
const { chat } = await import("../lib/llm.mjs");

console.log("1) Jina embeddings");
const v = await embedOne("무료 GPU");
let norm = 0; for (const x of v) norm += x * x;
ok(Array.isArray(v) && v.length === DIM, `embedding should be ${DIM}-dim (got ${v.length})`);
ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6, "embedding should be L2-normalized");

console.log("2) Jina reranker reorders by relevance");
const hits = [{ text: "고양이 사진 모음" }, { text: "무료 GPU Kaggle ZeroGPU" }, { text: "오늘 날씨" }];
const r = await rerank("무료 GPU", hits, 2);
ok(r.length === 2 && /무료 GPU/.test(r[0].text), `top rerank hit should be the GPU doc (got "${r[0].text}")`);

console.log("3) web search");
const sr = await webSearch("벡터DB", { max: 2 });
ok(sr.length === 2 && sr[0].url && sr[0].title, "web search should return titled results with urls");

console.log("4) YouTube transcript");
ok(isYoutube("https://youtu.be/abcdefghijk"), "isYoutube should match youtu.be");
ok(videoId("https://www.youtube.com/watch?v=abcdefghijk") === "abcdefghijk", "videoId parse");
const yt = await fetchYoutubeTranscript("https://www.youtube.com/watch?v=abcdefghijk");
ok(/무료 GPU/.test(yt.text) && /목 영상/.test(yt.title), `transcript should extract text+title (got "${yt.title}")`);

console.log("5) server-side LLM chat");
const a = await chat([{ role: "user", content: "근거 [1] 기반 답변" }]);
ok(/\[MOCK\]/.test(a), "chat should return the mock answer");

console.log("\n✅ PASS — jina embeddings, reranker, web search, youtube transcript, llm chat all wired.");
process.exit(0);
