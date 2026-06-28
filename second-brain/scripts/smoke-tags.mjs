// Offline E2E: free tags + favorites. EMBED_PROVIDER=hashing.
import { storeDoc } from "../lib/pipeline.mjs";
import { search, setTags, setFav, listDocs, tagFacet } from "../lib/store.mjs";
import { embedOne } from "../lib/embed.mjs";

const ok = (c, m) => { if (!c) { console.log("❌ FAIL —", m); process.exit(1); } };

const A = await storeDoc({ text: "Kaggle 무료 GPU 30시간", title: "GPU", topic: "인프라", tags: ["gpu", "free"] });
const B = await storeDoc({ text: "Resend 무료 이메일 발송", title: "Resend", topic: "이메일", tags: ["email"] });
const C = await storeDoc({ text: "ntfy 무료 푸시 알림", title: "ntfy", topic: "알림" });

console.log("1) tag facet");
let facet = await tagFacet();
console.log("   ", facet);
ok(facet.find((f) => f.tag === "gpu")?.docs === 1, "gpu tag facet");
ok(facet.find((f) => f.tag === "free")?.docs === 1, "free tag facet");
ok(facet.find((f) => f.tag === "email")?.docs === 1, "email tag facet");

console.log("2) favorite toggle + list");
await setFav(A.docId, 1);
let favs = await listDocs({ fav: 1 });
ok(favs.length === 1 && favs[0].docId === A.docId, "only A favorited");
ok(favs[0].fav === 1 && favs[0].tags.includes("gpu"), "fav doc carries tags");

console.log("3) filter search by tag and by fav");
const byTag = await search(await embedOne("무료"), 10, { tag: "email" });
ok(byTag.length >= 1 && byTag.every((h) => h.docId === B.docId), "tag=email isolates B");
const byFav = await search(await embedOne("무료"), 10, { fav: 1 });
ok(byFav.length >= 1 && byFav.every((h) => h.docId === A.docId), "fav filter isolates A");
console.log("   tag=email:", byTag.length, "| fav:", byFav.length);

console.log("4) listDocs by tag");
const tagged = await listDocs({ tag: "gpu" });
ok(tagged.length === 1 && tagged[0].docId === A.docId, "listDocs tag=gpu -> A");

console.log("5) add tags to an untagged doc");
await setTags(C.docId, ["push", "free"]);
facet = await tagFacet();
ok(facet.find((f) => f.tag === "push")?.docs === 1, "push tag added");
ok(facet.find((f) => f.tag === "free")?.docs === 2, "free now spans 2 docs");

console.log("\n✅ PASS — tags, favorites, facets, and tag/fav filters all work.");
process.exit(0);
