// Keyless YouTube transcript fetch: load the watch page, find a caption track,
// fetch its timedtext XML, and flatten it to text. Best-effort (YouTube can
// change markup); throws a clear error when no transcript is available.
const WATCH_URL = process.env.YT_WATCH_URL || "https://www.youtube.com/watch";

export function isYoutube(url = "") {
  return /(?:youtube\.com\/watch\?|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

export function videoId(url = "") {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ||
    url.match(/youtu\.be\/([\w-]{11})/) ||
    url.match(/shorts\/([\w-]{11})/);
  return m ? m[1] : null;
}

function decode(s) {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export async function fetchYoutubeTranscript(url) {
  const id = videoId(url);
  if (!id) throw new Error("유효한 YouTube 영상 URL이 아닙니다");

  const page = await fetch(`${WATCH_URL}?v=${id}`, {
    headers: { "Accept-Language": "ko,en", "User-Agent": "Mozilla/5.0" },
  });
  if (!page.ok) throw new Error(`youtube page ${page.status}`);
  const html = await page.text();

  const titleM = html.match(/"title":"([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const title = titleM ? decode(titleM[1]).replace(/ - YouTube$/, "") : id;

  const tracksM = html.match(/"captionTracks":(\[.*?\])/);
  if (!tracksM) throw new Error("이 영상에는 자막이 없습니다 (또는 비공개)");
  let tracks;
  try { tracks = JSON.parse(tracksM[1]); } catch { throw new Error("자막 트랙 파싱 실패"); }

  // prefer Korean, then English, then anything
  const pick = tracks.find((t) => /^ko/.test(t.languageCode)) ||
    tracks.find((t) => /^en/.test(t.languageCode)) || tracks[0];
  if (!pick?.baseUrl) throw new Error("자막 트랙 URL 없음");

  const xmlRes = await fetch(decode(pick.baseUrl));
  if (!xmlRes.ok) throw new Error(`timedtext ${xmlRes.status}`);
  const xml = await xmlRes.text();
  const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decode(m[1]).replace(/\n+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  if (!text) throw new Error("자막 내용이 비어 있습니다");

  return { title, text };
}
