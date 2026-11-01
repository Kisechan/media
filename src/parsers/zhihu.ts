import { ParseError, type MediaItem, type ParsedContent, type Parser } from "../types";

const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
function textFromHtml(html: string): string { return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(); }
function imageUrls(html: string): string[] {
  const found = [...html.matchAll(/<img\b[^>]*(?:data-original|data-actualsrc|src)=["']([^"']+)["'][^>]*>/gi)].map(m => m[1].replace(/&amp;/g, "&"));
  return [...new Set(found.filter(url => /^https:\/\//.test(url)))];
}
function videoVariants(playlist: any): { label: string; url: string; bitrate?: number }[] {
  const values = Array.isArray(playlist) ? playlist : playlist && typeof playlist === "object" ? Object.values(playlist) : [];
  return values.filter((v: any) => typeof v?.play_url === "string" || typeof v?.url === "string").map((v: any) => ({ label: v.width && v.height ? `${v.width}×${v.height}` : "MP4", url: v.play_url || v.url, bitrate: Number(v.bitrate || 0) })).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
}
export const zhihuParser: Parser = {
  platform: "zhihu",
  async parse(url, fetcher = fetch): Promise<ParsedContent> {
    const patterns: [ParsedContent["type"], RegExp, string][] = [["answer", /\/answer\/(\d+)/, "answers"], ["article", /\/(?:p|article)\/(\d+)/, "articles"], ["pin", /\/pin\/(\d+)/, "pins"], ["video", /\/zvideo\/(\d+)/, "videos"]];
    const match = patterns.map(([type, pattern, endpoint]) => ({ type, id: url.pathname.match(pattern)?.[1], endpoint })).find(x => x.id);
    if (!match?.id) throw new ParseError("INVALID_URL", "知乎链接类型或内容 ID 暂不支持", 400);
    let data: any = null;
    let blocked = false;
    try {
      const response = await fetcher(`https://api.zhihu.com/${match.endpoint}/${match.id}`, { headers: { "user-agent": ua, referer: "https://www.zhihu.com/", accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (response.status === 403) blocked = true;
      if (response.ok) { const json = await response.json() as any; if (!json.error) data = json; }
    } catch { /* HTML fallback */ }
    if (!data) try {
      const response = await fetcher(url, { headers: { "user-agent": ua, referer: "https://www.zhihu.com/" }, signal: AbortSignal.timeout(10000) });
      if (response.status === 403) blocked = true;
      if (response.ok) {
        const html = await response.text();
        const json = html.match(/<script id="js-initialData"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        const entities = json ? JSON.parse(json)?.initialState?.entities : null;
        const key = match.type === "video" ? "zvideos" : `${match.endpoint}`;
        data = entities?.[key]?.[match.id];
      }
    } catch { /* exhausted */ }
    if (!data) throw new ParseError(blocked ? "LOGIN_REQUIRED" : "CONTENT_UNAVAILABLE", blocked ? "知乎限制了当前网络的公开内容访问" : "未能读取知乎内容", blocked ? 403 : 502);
    const html = typeof data.content === "string" ? data.content : typeof data.content_html === "string" ? data.content_html : "";
    const images = [...new Set([data.title_image, ...imageUrls(html)].filter((v): v is string => typeof v === "string" && v.startsWith("https://")))];
    const media: MediaItem[] = images.map(url => ({ kind: "image", original: true, variants: [{ label: "原图", url }] }));
    let videos = videoVariants(data.playlist || data.content?.find?.((v: any) => v.type === "video")?.playlist);
    const lensId = html.match(/data-lens-id=["'](\d+)["']/)?.[1];
    if (!videos.length && lensId) try {
      const response = await fetcher(`https://lens.zhihu.com/api/v4/videos/${lensId}`, { headers: { "user-agent": ua, referer: "https://www.zhihu.com/" }, signal: AbortSignal.timeout(8000) });
      if (response.ok) videos = videoVariants((await response.json() as any).playlist);
    } catch { /* optional video */ }
    if (videos.length) media.push({ kind: "video", variants: videos.map(v => ({ ...v, mimeType: "video/mp4" })) });
    return { platform: "zhihu", id: match.id, sourceUrl: url.href, type: match.type, title: String(data.question?.title || data.title || data.excerpt_title || ""), author: { name: String(data.author?.name || data.author?.name || ""), id: data.author?.id, avatar: data.author?.avatar_url }, text: textFromHtml(html) || String(data.excerpt || ""), media, warnings: [] };
  },
};
