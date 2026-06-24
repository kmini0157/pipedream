// Tiny dependency-free RSS/Atom parser. Not a spec-complete XML parser — just
// robust enough to pull items out of real-world feeds.

function decode(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ") // strip any inline html
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

function atomLink(block) {
  // <link href="..." /> possibly multiple; prefer rel="alternate" or no rel.
  const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const pick = links.find((l) => /rel=["']?alternate/i.test(l)) || links[0] || "";
  const href = pick.match(/href=["']([^"']+)["']/i);
  return href ? href[1] : "";
}

export function parseFeed(xml) {
  const items = [];
  const blocks = [
    ...[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]),
    ...[...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]),
  ];
  for (const b of blocks) {
    const title = tag(b, "title");
    const link =
      tag(b, "link") || atomLink(b) || tag(b, "guid") || tag(b, "id");
    const body =
      tag(b, "content:encoded") ||
      tag(b, "content") ||
      tag(b, "description") ||
      tag(b, "summary");
    const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published");
    const guid = tag(b, "guid") || tag(b, "id") || link || title;
    if (title || body) items.push({ title, link, body, date, guid });
  }
  return items;
}
