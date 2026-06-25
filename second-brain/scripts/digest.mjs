// Cron entrypoint: build the digest for the last N hours and deliver it.
import { buildDigest } from "../lib/digest.mjs";
import { deliver } from "../lib/notify.mjs";

const hours = Number(process.env.DIGEST_HOURS || 24);
const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
const label = new Date().toISOString().slice(0, 10);

const digest = await buildDigest(cutoff, label);
console.log(`digest: ${digest.count} item(s), ${digest.topics} topic(s)`);
const sent = await deliver(digest, { title: `🧠 다이제스트 ${label}` });
console.log("delivery:", sent);
