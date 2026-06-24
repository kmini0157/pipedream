// Offline E2E for the daily loop: add watch -> collect from sample feed ->
// dedup on re-collect -> build digest. No network. Run with EMBED_PROVIDER=hashing.
import { add as addWatch, getRaw, remove } from "../lib/feeds.mjs";
import { collectFromXml } from "../lib/collect.mjs";
import { buildDigest } from "../lib/digest.mjs";
import { deliver } from "../lib/notify.mjs";

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>AI Free Stack</title>
  <item>
    <title>Kaggle, 주당 30시간 무료 GPU 제공</title>
    <link>https://example.com/kaggle-gpu</link>
    <guid>kaggle-gpu-1</guid>
    <description><![CDATA[Kaggle은 노트북 환경에서 주당 30시간의 무료 GPU를 제공한다. 별도 결제 없이 딥러닝 실험이 가능하다. 캐글 계정만 있으면 된다.]]></description>
    <pubDate>Tue, 24 Jun 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Hugging Face ZeroGPU에서 H200 사용</title>
    <link>https://example.com/hf-zerogpu</link>
    <guid>hf-zerogpu-1</guid>
    <description><![CDATA[Hugging Face Spaces의 ZeroGPU는 H200 GPU를 무료로 빌려 쓸 수 있게 해준다. Pro 사용자에게 더 넉넉한 할당이 주어진다.]]></description>
    <pubDate>Tue, 24 Jun 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

function assert(cond, msg) {
  if (!cond) { console.log("❌ FAIL —", msg); process.exit(1); }
}

// clean slate for this watch
for (const w of getRaw()) if (w.topic === "무료 AI 인프라") remove(w.id);

console.log("1) add watch");
const watch = addWatch({ topic: "무료 AI 인프라", url: "https://example.com/feed.xml", type: "rss" });
const fresh = getRaw().find((w) => w.id === watch.id);

console.log("2) first collect");
const r1 = await collectFromXml(fresh, SAMPLE);
console.log("   ", r1);
assert(r1.new === 2, `expected 2 new, got ${r1.new}`);

console.log("3) re-collect (should dedup to 0 new)");
const fresh2 = getRaw().find((w) => w.id === watch.id);
const r2 = await collectFromXml(fresh2, SAMPLE);
console.log("   ", r2);
assert(r2.new === 0, `expected 0 new on re-run, got ${r2.new}`);

console.log("4) build digest (last 24h)");
const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const digest = buildDigest(cutoff, "2026-06-24");
assert(digest.count >= 2, `digest should include >=2 items, got ${digest.count}`);
assert(/무료 AI 인프라/.test(digest.markdown), "digest missing topic heading");
assert(/Kaggle/.test(digest.markdown), "digest missing Kaggle item");

console.log("5) deliver to file");
process.env.NOTIFY = "file";
const sent = await deliver(digest, { title: "test" });
console.log("   ", sent);

console.log("\n--- digest preview ---\n" + digest.markdown.split("\n").slice(0, 12).join("\n"));
console.log("\n✅ PASS — watch → collect → dedup → digest → deliver all work offline.");
process.exit(0);
