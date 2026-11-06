import { ParseError, type MediaItem, type ParsedContent, type Parser } from "../types";

const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
const mobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
function record(value: any): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function imageUrl(value: any): string | undefined {
  const image = record(value);
  const fileId = image.fileId;
  if (typeof fileId === "string" && fileId) return `https://sns-img-bd.xhscdn.com/${fileId}`;
  const url = image.urlDefault || image.url || image.infoList?.[0]?.url;
  if (typeof url !== "string") return undefined;
  return url.split("!")[0].replace("http://", "https://");
}
function videoUrls(note: Record<string, any>): { url: string; watermarkFree: boolean | null; label: string }[] {
  const video = record(note.video);
  const result: { url: string; watermarkFree: boolean | null; label: string }[] = [];
  const origin = video.consumer?.originVideoKey || video.originVideoKey;
  if (typeof origin === "string" && origin) result.push({ url: origin.startsWith("http") ? origin : `https://sns-video-bd.xhscdn.com/${origin.replace(/^\//, "")}`, watermarkFree: true, label: "原始视频" });
  try {
    const mediaV2 = typeof video.mediaV2 === "string" ? JSON.parse(video.mediaV2) : video.mediaV2;
    const opaque = mediaV2?.video?.opaque1;
    for (const [field, label] of [["hd_screencast_stream", "高清"], ["default_screencast_stream", "标准"]]) {
      if (typeof opaque?.[field] === "string") result.push({ url: opaque[field], watermarkFree: true, label });
    }
  } catch { /* optional representation */ }
  const stream = video.media?.stream || video.stream || {};
  for (const codec of ["h264", "h265", "av1"]) for (const item of stream[codec] || []) {
    if (typeof item.masterUrl === "string") result.push({ url: item.masterUrl.replace(/^http:\/\//, "https://"), watermarkFree: [258, 301].includes(item.streamType) || String(item.streamDesc).includes("X264_MP4") ? true : null, label: `${codec.toUpperCase()} ${item.width || ""}×${item.height || ""}` });
  }
  return result.filter((v, i) => result.findIndex(other => other.url === v.url) === i).sort((a, b) => Number(b.watermarkFree === true) - Number(a.watermarkFree === true));
}
function initialState(html: string): any {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!match) return null;
  const source = match[1].trim().replace(/;\s*$/, "").replace(/\bundefined\b/g, "null").replace(/new Map\(\[\]\)/g, "{}").replace(/new Set\(\[\]\)/g, "[]");
  try { return JSON.parse(source); } catch { return null; }
}
export const xiaohongshuParser: Parser = {
  platform: "xiaohongshu",
  async parse(url, fetcher = fetch): Promise<ParsedContent> {
    const id = url.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{16,32})/i)?.[1];
    if (!id) throw new ParseError("INVALID_URL", "小红书链接缺少笔记 ID", 400);
    let note: Record<string, any> = {};
    let blocked = false;
    for (const ua of [desktop, mobile]) {
      let response: Response;
      try { response = await fetcher(url, { headers: { "user-agent": ua, referer: "https://www.xiaohongshu.com/", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) }); }
      catch { continue; }
      if (response.url.includes("/login") || response.status === 403) { blocked = true; continue; }
      if (!response.ok) continue;
      const state = initialState(await response.text());
      const map = record(state?.note?.noteDetailMap);
      note = record(map[id]?.note || Object.values(map).map((v: any) => v?.note).find((v: any) => v?.noteId === id) || state?.noteData?.data?.noteData || state?.noteData?.note);
      if (note.noteId === id || note.id === id) break;
      note = {};
    }
    if (!Object.keys(note).length) throw new ParseError(blocked ? "LOGIN_REQUIRED" : "CONTENT_UNAVAILABLE", blocked ? "小红书要求登录或限制了当前网络访问" : "未能读取笔记内容；分享链接可能已失效", blocked ? 403 : 502);
    const images: MediaItem[] = (Array.isArray(note.imageList) ? note.imageList : []).flatMap((img: any) => {
      const url = imageUrl(img);
      if (!url) return [];
      const original = typeof img.fileId === "string" && !!img.fileId;
      return [{ kind: "image" as const, original, watermarkFree: original ? true : null, variants: [{ label: img.livePhoto ? "实况静态源图" : original ? "原图" : "图片源", url, width: img.width, height: img.height }] }];
    });
    const candidates = videoUrls(note);
    const checked = await Promise.all(candidates.map(async video => {
      try {
        const response = await fetcher(video.url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        return response.ok ? video : null;
      } catch { return null; }
    }));
    const videos = checked.filter((video): video is NonNullable<typeof video> => video !== null);
    const media: MediaItem[] = [...images, ...(videos.length ? [{ kind: "video" as const, thumbnail: imageUrl(note.cover), watermarkFree: videos[0].watermarkFree, variants: videos.map(v => ({ label: v.label, url: v.url, mimeType: "video/mp4" })) }] : [])];
    return { platform: "xiaohongshu", id, sourceUrl: url.href, type: note.type === "video" || candidates.length ? "video" : "post", title: String(note.title || ""), author: { name: String(note.user?.nickname || note.user?.nickName || ""), id: note.user?.userId, avatar: note.user?.avatar }, text: String(note.desc || ""), media, warnings: [...(candidates.length && !videos.length ? ["原站提供的视频地址目前不可访问。"] : []), ...(videos.length && videos[0].watermarkFree !== true ? ["视频源未能确认无水印。"] : [])] };
  },
};
