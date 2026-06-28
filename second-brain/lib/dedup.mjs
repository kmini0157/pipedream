// Duplicate detection + merge, backend-agnostic (works on centroids the store
// exposes). Two docs are duplicates when they share a contentHash (exact) or
// their centroid cosine similarity is >= threshold (near-duplicate).
import { docCentroids, setTags, setFav, deleteDocs } from "./store.mjs";

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export async function findDuplicates(threshold = 0.92) {
  const docs = await docCentroids();
  const n = docs.length;

  // Union-find: connect docs that are near-duplicates (cosine >= threshold)
  // OR share a contentHash (exact). This keeps an exact pair and a doc that is
  // merely similar to it in the SAME cluster, instead of splitting them.
  const parent = docs.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };

  const edge = []; // remember the similarity that linked a pair, for scoring
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameHash = docs[i].contentHash && docs[i].contentHash === docs[j].contentHash;
      const s = cosine(docs[i].vec, docs[j].vec);
      if (sameHash || s >= threshold) { union(i, j); edge.push([i, j, sameHash ? 1 : s]); }
    }
  }

  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  const groups = [];
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => docs[i]);
    const hashes = new Set(members.map((m) => m.contentHash).filter(Boolean));
    const allExact = hashes.size === 1 && members.every((m) => m.contentHash);
    // tightest link inside the cluster (excluding trivial identical pairs)
    let score = 0;
    const set = new Set(idxs);
    for (const [a, b, s] of edge) if (set.has(a) && set.has(b)) score = Math.max(score, s);
    // docIds that are byte-identical (share the dominant contentHash, count > 1)
    const byHash = {};
    for (const m of members) if (m.contentHash) (byHash[m.contentHash] ||= []).push(m.docId);
    const exactDocIds = Object.values(byHash).find((g) => g.length > 1) || [];
    groups.push({
      reason: allExact ? "exact" : "similar",
      score: Number(score.toFixed(3)),
      exactDocIds,
      docs: members.map(meta).sort((a, b) => (a.ts < b.ts ? -1 : 1)),
    });
  }
  return groups.sort((a, b) => b.score - a.score);
}

function meta(d) {
  return { docId: d.docId, title: d.title, ts: d.ts, chunks: d.chunks, tags: d.tags, fav: d.fav };
}

// Keep one doc, fold the others into it (union tags, OR favorite), delete them.
export async function merge(keepDocId, dropDocIds) {
  const docs = await docCentroids();
  const all = [keepDocId, ...dropDocIds];
  const involved = docs.filter((d) => all.includes(d.docId));
  const tags = new Set();
  let fav = 0;
  for (const d of involved) {
    (d.tags || []).forEach((t) => tags.add(t));
    if (d.fav) fav = 1;
  }
  await setTags(keepDocId, [...tags]);
  if (fav) await setFav(keepDocId, 1);
  const removed = await deleteDocs(dropDocIds.filter((id) => id !== keepDocId));
  return { keepDocId, dropped: dropDocIds.length, removedChunks: removed, tags: [...tags], fav };
}
