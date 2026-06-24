// Pluggable digest delivery. NOTIFY=console|file|ntfy|resend (comma-separated ok).
//   console (default) — print to stdout
//   file              — write data/digest-latest.md
//   ntfy              — POST to ntfy.sh/<NTFY_TOPIC> (keyless push)
//   resend            — email via Resend (needs RESEND_API_KEY, RESEND_TO, RESEND_FROM)
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = new URL("../data/digest-latest.md", import.meta.url).pathname;

export async function deliver(digest, opts = {}) {
  const channels = (process.env.NOTIFY || "console").split(",").map((s) => s.trim());
  const results = {};
  for (const ch of channels) {
    try {
      results[ch] = await send(ch, digest, opts);
    } catch (e) {
      results[ch] = "error: " + (e.message || e);
    }
  }
  return results;
}

async function send(ch, digest, opts) {
  if (ch === "console") {
    console.log("\n" + digest.markdown + "\n");
    return "printed";
  }
  if (ch === "file") {
    const dir = OUT.slice(0, OUT.lastIndexOf("/"));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(OUT, digest.markdown);
    return OUT;
  }
  if (ch === "ntfy") {
    const topic = process.env.NTFY_TOPIC;
    if (!topic) throw new Error("NTFY_TOPIC not set");
    const title = opts.title || "오늘의 다이제스트";
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: encodeURIComponent(title), Markdown: "yes" },
      body: digest.markdown.slice(0, 4000),
    });
    return res.ok ? "pushed" : "ntfy " + res.status;
  }
  if (ch === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Second Brain <onboarding@resend.dev>",
        to: (process.env.RESEND_TO || "").split(",").filter(Boolean),
        subject: opts.title || "🧠 오늘의 다이제스트",
        text: digest.markdown,
      }),
    });
    return res.ok ? "emailed" : "resend " + res.status;
  }
  throw new Error("unknown channel " + ch);
}
