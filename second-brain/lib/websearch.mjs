// Live web search so the brain can answer with fresh sources (and optionally
// auto-ingest them). Pluggable via SEARCH_PROVIDER:
//   tavily -> api.tavily.com (TAVILY_API_KEY), LLM-oriented results
//   brave  -> Brave Search API (BRAVE_API_KEY)
//   jina   -> s.jina.ai (keyless reader-style search), returns markdown
// Each endpoint URL is overridable for testing. Returns [{title, url, snippet}].
const PROVIDER = process.env.SEARCH_PROVIDER || "";
const TAVILY_URL = process.env.TAVILY_URL || "https://api.tavily.com/search";
const BRAVE_URL = process.env.BRAVE_URL || "https://api.search.brave.com/res/v1/web/search";
const JINA_SEARCH_URL = process.env.JINA_SEARCH_URL || "https://s.jina.ai/";

export const searchEnabled = !!PROVIDER;

export async function webSearch(query, { max = 5 } = {}) {
  if (!PROVIDER) throw new Error("SEARCH_PROVIDER not set");
  if (PROVIDER === "tavily") return tavily(query, max);
  if (PROVIDER === "brave") return brave(query, max);
  if (PROVIDER === "jina") return jina(query, max);
  throw new Error("unknown SEARCH_PROVIDER: " + PROVIDER);
}

async function tavily(query, max) {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: max }),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, max).map((r) => ({
    title: r.title, url: r.url, snippet: r.content || "",
  }));
}

async function brave(query, max) {
  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=${max}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY || "" },
  });
  if (!res.ok) throw new Error(`brave ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).slice(0, max).map((r) => ({
    title: r.title, url: r.url, snippet: r.description || "",
  }));
}

async function jina(query, max) {
  // s.jina.ai returns JSON when asked; keyless (a JINA_API_KEY raises limits).
  const res = await fetch(JINA_SEARCH_URL + encodeURIComponent(query), {
    headers: {
      Accept: "application/json",
      ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`jina search ${res.status}`);
  const data = await res.json();
  const items = data.data || data.results || [];
  return items.slice(0, max).map((r) => ({
    title: r.title, url: r.url, snippet: r.description || r.content?.slice(0, 300) || "",
  }));
}
