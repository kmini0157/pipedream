// Verify native/backfill telemetry on libSQL. A filter that matches fewer than
// k docs forces the ANN path to backfill with an exhaustive scan — that must be
// counted, not silent. Run with STORE=libsql.
//   EMBED_PROVIDER=hashing STORE=libsql LIBSQL_URL=file:data/tel.db node scripts/smoke-telemetry.mjs
import { storeDoc } from "../lib/pipeline.mjs";
import { search, telemetry, backend } from "../lib/store.mjs";
import { embedOne } from "../lib/embed.mjs";

const ok = (c, m) => { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } };
ok(backend === "libsql", "this test requires STORE=libsql");

// 10 docs; only 2 in topic "rare".
for (let i = 0; i < 8; i++) await storeDoc({ text: `흔한 무료 문서 ${i} 내용`, title: `common${i}`, topic: "common" });
await storeDoc({ text: "희귀 무료 문서 하나", title: "rare1", topic: "rare" });
await storeDoc({ text: "희귀 무료 문서 둘", title: "rare2", topic: "rare" });

const qv = await embedOne("무료 문서");

console.log("1) unfiltered search uses the native ANN path");
const before = await telemetry();
await search(qv, 5);
const afterNative = await telemetry();
ok(afterNative.native === before.native + 1, `native counter should increment (${before.native}->${afterNative.native})`);
ok(afterNative.backfill === before.backfill, "no backfill on unfiltered search");

console.log("2) filter matching < k forces a counted backfill");
const hits = await search(qv, 5, { topic: "rare" });
const afterFilter = await telemetry();
ok(hits.length === 2 && hits.every((h) => h.topic === "rare"), `should return the 2 rare docs (got ${hits.length})`);
ok(afterFilter.backfill === afterNative.backfill + 1, `backfill counter should increment (${afterNative.backfill}->${afterFilter.backfill})`);

console.log("   telemetry:", JSON.stringify(await telemetry()));
console.log("\n✅ PASS — backfill is observable: native vs backfill counters track correctly.");
process.exit(0);
