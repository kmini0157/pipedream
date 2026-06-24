// Cron entrypoint: poll every watch and ingest new items.
import { collectAll } from "../lib/collect.mjs";

const results = await collectAll();
const total = results.reduce((n, r) => n + (r.new || 0), 0);
for (const r of results) {
  if (r.error) console.log(`  ✗ ${r.topic}: ${r.error}`);
  else console.log(`  ✓ ${r.topic}: ${r.new} new / ${r.found} found`);
}
console.log(`collected ${total} new item(s) across ${results.length} watch(es)`);
