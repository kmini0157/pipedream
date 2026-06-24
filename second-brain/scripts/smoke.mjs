// End-to-end smoke test with NO network: embed -> store -> search.
// Runs with EMBED_PROVIDER=hashing so it works where the model host is blocked.
import { embed, embedOne, provider } from "../lib/embed.mjs";
import { add, search, stats } from "../lib/store.mjs";
import { chunk } from "../lib/ingest.mjs";

console.log(`provider: ${provider}`);

const docs = [
  { title: "무료 GPU 메모", text: "Kaggle은 주당 30시간 무료 GPU를 준다. Hugging Face Spaces의 ZeroGPU는 H200 GPU를 쓸 수 있다." },
  { title: "벡터DB 메모", text: "Pinecone은 2GB까지 영구 무료다. Chroma와 Qdrant는 로컬에서 셀프호스트할 수 있다." },
  { title: "이메일 메모", text: "Resend는 트랜잭션 이메일 무료 티어가 있고, ntfy는 푸시 알림을 무료로 보낸다." },
];

console.log("1) ingest + embed + store…");
for (const [di, d] of docs.entries()) {
  const chunks = chunk(d.text);
  const vecs = await embed(chunks);
  add(chunks.map((text, i) => ({
    id: `smoke${di}-${i}`, docId: `smoke${di}`, source: "smoke",
    title: d.title, text, vec: vecs[i], ts: new Date().toISOString(),
  })));
}
console.log("   stats:", stats());

console.log("2) retrieval…");
const cases = [
  { q: "무료 GPU H200 어디서 쓰지", expect: "무료 GPU 메모" },
  { q: "Pinecone 무료 용량", expect: "벡터DB 메모" },
  { q: "푸시 알림 무료로 보내기", expect: "이메일 메모" },
];

let pass = 0;
for (const c of cases) {
  const hits = search(await embedOne(c.q), 3);
  const top = hits[0];
  const ok = top && top.title === c.expect;
  if (ok) pass++;
  console.log(`   ${ok ? "✓" : "✗"} "${c.q}" -> ${top?.title} (${top?.score.toFixed(3)})`);
}

if (pass === cases.length) {
  console.log(`\n✅ PASS — ${pass}/${cases.length} retrieved the right note.`);
  process.exit(0);
}
console.log(`\n❌ FAIL — ${pass}/${cases.length}`);
process.exit(1);
