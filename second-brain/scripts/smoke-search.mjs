// Offline E2E for search UX: topic filter, date range, facets. EMBED_PROVIDER=hashing.
import { storeDoc } from "../lib/pipeline.mjs";
import { search, topics } from "../lib/store.mjs";
import { embedOne } from "../lib/embed.mjs";

function assert(c, m) { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } }

// Seed across two topics. storeDoc stamps ts=now; we backdate one by writing
// directly is overkill, so we test date range with now-bounded windows.
await storeDoc({ text: "Kaggle은 주당 30시간 무료 GPU를 준다.", title: "Kaggle GPU", topic: "인프라", kind: "note" });
await storeDoc({ text: "Hugging Face ZeroGPU는 H200을 무료로 쓸 수 있다.", title: "ZeroGPU", topic: "인프라", kind: "note" });
await storeDoc({ text: "Resend는 트랜잭션 이메일 무료 티어가 있다.", title: "Resend", topic: "이메일", kind: "clip" });

console.log("1) topic facets");
const facets = await topics();
console.log("   ", facets);
const inf = facets.find((f) => f.topic === "인프라");
assert(inf && inf.docs === 2, "인프라 should have 2 docs");
assert(facets.find((f) => f.topic === "이메일")?.docs === 1, "이메일 should have 1 doc");

console.log("2) topic filter narrows results");
const q = await embedOne("무료");
const all = await search(q, 10);
const onlyEmail = await search(q, 10, { topic: "이메일" });
assert(all.length === 3, `unfiltered should see 3, got ${all.length}`);
assert(onlyEmail.length === 1 && onlyEmail[0].topic === "이메일", "topic filter should isolate 이메일");
console.log("   all:", all.length, "| topic=이메일:", onlyEmail.length);

console.log("3) date range");
const future = new Date(Date.now() + 60000).toISOString();
const past = new Date(Date.now() - 60000).toISOString();
const inWindow = await search(q, 10, { since: past, until: future });
const noneFuture = await search(q, 10, { since: future });
assert(inWindow.length === 3, `since/until window should include all 3, got ${inWindow.length}`);
assert(noneFuture.length === 0, `since=future should exclude all, got ${noneFuture.length}`);
console.log("   window:", inWindow.length, "| since=future:", noneFuture.length);

console.log("4) kind filter");
const clips = await search(q, 10, { kind: "clip" });
assert(clips.length === 1 && clips[0].kind === "clip", "kind filter should isolate clips");

console.log("\n✅ PASS — topic facets, topic/kind filter, and date range all work.");
process.exit(0);
