// Offline E2E for input channels: extract -> store -> search. EMBED_PROVIDER=hashing.
import { extractText } from "../lib/extract.mjs";
import { storeDoc } from "../lib/pipeline.mjs";
import { search } from "../lib/store.mjs";
import { embedOne } from "../lib/embed.mjs";

function assert(cond, msg) {
  if (!cond) { console.log("❌ FAIL —", msg); process.exit(1); }
}

console.log("1) extractText formats");
const html = extractText("page.html", "<html><head><title>무료 GPU 안내</title></head><body><h1>제목</h1><p>Kaggle은 주당 30시간 무료 GPU를 제공한다.</p><script>ignore()</script></body></html>");
console.log("   html ->", JSON.stringify(html.title), "|", html.text.slice(0, 30));
assert(html.title === "무료 GPU 안내", "html title");
assert(/Kaggle/.test(html.text) && !/ignore/.test(html.text), "html body stripped");

const md = extractText("notes.md", "# Pinecone 메모\n\nPinecone은 2GB까지 영구 무료다.");
assert(md.title === "Pinecone 메모", "md title from heading");

const json = extractText("d.json", '{"tool":"ntfy","free":true}');
assert(/ntfy/.test(json.text), "json text");

let threw = false;
try { extractText("x.pdf", "%PDF-1.4..."); } catch { threw = true; }
assert(threw, "pdf rejected with message");

console.log("2) store extracted file + clip, then retrieve");
await storeDoc({ ...extractText("page.html", "<title>무료 GPU 안내</title><p>Kaggle은 주당 30시간 무료 GPU를 제공한다.</p>"), source: "page.html", kind: "file" });
await storeDoc({ text: "Cloudflare R2 storage egress 비용 무료", title: "R2 클립", kind: "clip" });

const hits1 = await search(await embedOne("무료 GPU 시간"), 3);
assert(hits1[0]?.title === "무료 GPU 안내", `expected GPU file top, got ${hits1[0]?.title}`);
const hits2 = await search(await embedOne("R2 storage egress"), 3);
assert(hits2[0]?.title === "R2 클립", `expected clip top, got ${hits2[0]?.title}`);
console.log("   file ->", hits1[0].title, "| clip ->", hits2[0].title);

console.log("\n✅ PASS — extract (html/md/json) + file + clip channels all ingest & retrieve.");
process.exit(0);
