// Extract plain text + a title from common text-based file formats.
// Binary formats (PDF/docx) are rejected with a clear message — handle those
// client-side (e.g. Puter OCR) and POST the resulting text to /ingest.

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtml(html) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? decodeEntities(titleM[1].replace(/<[^>]+>/g, "").trim()) : "";
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
  return { title, text };
}

// content: a utf-8 string. name: original filename (for ext + title fallback).
export function extractText(name = "", content = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const baseTitle = name.replace(/\.[^.]+$/, "") || "업로드";

  if (ext === "html" || ext === "htm" || /^\s*<(!doctype|html)/i.test(content)) {
    const { title, text } = stripHtml(content);
    return { title: title || baseTitle, text };
  }
  if (ext === "json") {
    try {
      return { title: baseTitle, text: JSON.stringify(JSON.parse(content), null, 2) };
    } catch {
      return { title: baseTitle, text: content };
    }
  }
  if (ext === "md" || ext === "markdown") {
    const h = content.match(/^#\s+(.+)$/m);
    return { title: h ? h[1].trim() : baseTitle, text: content };
  }
  if (ext === "pdf" || ext === "docx" || ext === "doc") {
    throw new Error(`${ext}는 바이너리라 서버 추출 미지원 — 클라이언트에서 텍스트로 변환 후 /ingest 사용`);
  }
  // txt, csv, log, or unknown text
  return { title: baseTitle, text: content };
}
