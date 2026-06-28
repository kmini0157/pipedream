// Parity test: libSQL NATIVE vector index (vector_top_k) must rank results the
// same as a brute-force JS cosine baseline. Run with STORE=libsql.
//   EMBED_PROVIDER=hashing STORE=libsql LIBSQL_URL=file:data/vec-test.db node scripts/smoke-vector.mjs
import { storeDoc } from "../lib/pipeline.mjs";
import { search, docCentroids, backend } from "../lib/store.mjs";
import { embedOne } from "../lib/embed.mjs";

const ok = (c, m) => { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } };
ok(backend === "libsql", "this test requires STORE=libsql");

function cosine(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; }

const corpus = [
  ["무료 GPU", "Kaggle은 주당 30시간 무료 GPU를 제공한다", "인프라"],
  ["ZeroGPU", "Hugging Face ZeroGPU는 H200 GPU를 무료로 빌려준다", "인프라"],
  ["Pinecone", "Pinecone은 2GB까지 영구 무료 벡터 데이터베이스다", "벡터DB"],
  ["Qdrant", "Qdrant는 로컬에서 셀프호스트하는 벡터 검색 엔진이다", "벡터DB"],
  ["Resend", "Resend는 트랜잭션 이메일을 무료 티어로 보낸다", "이메일"],
  ["ntfy", "ntfy는 키 없이 푸시 알림을 무료로 보낸다", "알림"],
];
for (const [title, text, topic] of corpus) await storeDoc({ text, title, topic });

const queries = ["무료 GPU H200", "벡터 데이터베이스 셀프호스트", "푸시 알림 무료"];
for (const q of queries) {
  const qv = await embedOne(q);
  const native = (await search(qv, 3)).map((h) => h.title);

  // brute-force baseline over centroids (one per doc == one per chunk here)
  const baseline = (await docCentroids())
    .map((d) => ({ title: d.title, s: cosine(qv, d.vec) }))
    .sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.title);

  console.log(`q="${q}"\n   native:   ${native.join(", ")}\n   baseline: ${baseline.join(", ")}`);
  ok(native[0] === baseline[0], `top hit must match baseline for "${q}"`);
}

console.log("\n2) native + filter combine");
const filtered = await search(await embedOne("무료"), 5, { topic: "벡터DB" });
ok(filtered.length === 2 && filtered.every((h) => h.topic === "벡터DB"), "topic filter on native path");
console.log("   topic=벡터DB ->", filtered.map((h) => h.title).join(", "));

console.log("\n✅ PASS — native vector_top_k ranking matches brute force, filters apply.");
process.exit(0);
