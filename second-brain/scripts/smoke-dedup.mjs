// Offline E2E: duplicate detection + merge. EMBED_PROVIDER=hashing.
import { storeDoc } from "../lib/pipeline.mjs";
import { findDuplicates, merge } from "../lib/dedup.mjs";
import { stats, listDocs } from "../lib/store.mjs";

const ok = (c, m) => { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } };

const TEXT = "Cloudflare R2는 에그레스 비용이 무료다. 객체 스토리지로 널리 쓰인다.";

const A = await storeDoc({ text: TEXT, title: "R2 원본", topic: "스토리지", tags: ["storage"] });
const B = await storeDoc({ text: TEXT, title: "R2 사본(완전 동일)", topic: "스토리지", tags: ["r2"] }); // exact dup
const C = await storeDoc({ text: TEXT + " 추천", title: "R2 유사", topic: "스토리지" }); // near dup (cosine ~0.97)
const D = await storeDoc({ text: "Kaggle은 주당 30시간 무료 GPU를 제공한다.", title: "무관", topic: "인프라" }); // unrelated

console.log("1) detect duplicates");
const groups = await findDuplicates(0.9);
console.log("   ", JSON.stringify(groups.map((g) => ({ reason: g.reason, score: g.score, exact: g.exactDocIds.length, docs: g.docs.map((d) => d.title) }))));

// A==B exact, C near-dup of A -> all three land in ONE cluster (reason similar).
const grp = groups.find((g) => g.docs.some((d) => d.docId === A.docId));
ok(grp, "should find a duplicate cluster containing A");
const ids = grp.docs.map((d) => d.docId);
ok(ids.includes(A.docId) && ids.includes(B.docId) && ids.includes(C.docId), "cluster should hold A, B and C");
ok(grp.reason === "similar", "cluster with a near-dup is 'similar'");
ok(grp.exactDocIds.includes(A.docId) && grp.exactDocIds.includes(B.docId), "A and B flagged as byte-identical");
// D must never be grouped with the R2 docs
ok(!groups.some((g) => g.docs.some((d) => d.docId === D.docId)), "unrelated D must not be a duplicate");

console.log("2) merge the cluster into the original (union tags)");
const before = await stats();
const res = await merge(A.docId, [B.docId, C.docId]);
console.log("   ", res);
const after = await stats();
ok(after.docs === before.docs - 2, `docs should drop by 2 (${before.docs}->${after.docs})`);

const docs = await listDocs();
const kept = docs.find((d) => d.docId === A.docId);
ok(kept && kept.tags.includes("storage") && kept.tags.includes("r2"), "merged doc should union tags storage+r2");
ok(!docs.some((d) => d.docId === B.docId || d.docId === C.docId), "dropped docs B and C should be gone");

console.log("\n✅ PASS — clustered duplicate detection and merge (tag union) all work.");
process.exit(0);
