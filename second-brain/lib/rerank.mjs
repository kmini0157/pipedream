// Optional reranking: retrieve a wide candidate set by vector similarity, then
// reorder by a cross-encoder for much better top-k precision.
//   RERANK=jina  -> Jina Reranker (api.jina.ai), needs JINA_API_KEY.
// Unconfigured (or on any error) -> pass through the original order (no-op).
const PROVIDER = process.env.RERANK || "";
const JINA_RERANK_URL = process.env.JINA_RERANK_URL || "https://api.jina.ai/v1/rerank";

export const reranking = !!PROVIDER;

// hits: [{ text, ... }]. Returns the same objects reordered, top `topK`.
export async function rerank(query, hits, topK) {
  if (!PROVIDER || hits.length <= 1) return hits.slice(0, topK);
  try {
    if (PROVIDER === "jina") {
      const key = process.env.JINA_API_KEY;
      if (!key) throw new Error("RERANK=jina requires JINA_API_KEY");
      const res = await fetch(JINA_RERANK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "jina-reranker-v2-base-multilingual",
          query,
          documents: hits.map((h) => h.text || ""),
          top_n: topK,
        }),
      });
      if (!res.ok) throw new Error(`jina rerank ${res.status}`);
      const data = await res.json();
      return data.results
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, topK)
        .map((r) => ({ ...hits[r.index], rerankScore: r.relevance_score }));
    }
    return hits.slice(0, topK);
  } catch (e) {
    console.warn("[second-brain] rerank failed, using vector order:", e.message);
    return hits.slice(0, topK);
  }
}
