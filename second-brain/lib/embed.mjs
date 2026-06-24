// Pluggable, keyless embeddings.
//
//   EMBED_PROVIDER=local   -> transformers.js all-MiniLM-L6-v2 (semantic, recommended).
//                             Downloads ~23MB once, then fully offline.
//   EMBED_PROVIDER=hashing -> pure-JS lexical hashing embedding (no deps, no
//                             network). Good keyword recall; use as a fallback
//                             where the model host is unreachable.
//
// Default is "local". Both return L2-normalized vectors so the store's dot
// product equals cosine similarity.

const PROVIDER = process.env.EMBED_PROVIDER || "local";

// ---------------------------------------------------------------- hashing ---
const DIM = 384; // match MiniLM so a store can be reused across providers

function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashingEmbed(text) {
  const vec = new Float32Array(DIM);
  const toks = tokenize(text);
  // unigrams + char trigrams for some sub-word robustness
  for (const tok of toks) {
    vec[hash(tok) % DIM] += 1;
    for (let i = 0; i < tok.length - 2; i++) {
      vec[hash("_" + tok.slice(i, i + 3)) % DIM] += 0.5;
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

// ------------------------------------------------------------------ local ---
let _extractor = null;
async function getExtractor() {
  if (!_extractor) {
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = new URL("../data/models/", import.meta.url).pathname;
    env.allowLocalModels = true;
    _extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
  }
  return _extractor;
}

async function localEmbed(text) {
  const extractor = await getExtractor();
  const res = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(res.data);
}

// ------------------------------------------------------------------- api ---
export async function embed(texts) {
  if (PROVIDER === "hashing") return texts.map(hashingEmbed);
  return Promise.all(texts.map(localEmbed));
}

export async function embedOne(text) {
  return (await embed([text]))[0];
}

export const provider = PROVIDER;
