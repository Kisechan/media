import { ParseError, type ParsedContent, type Parser, type MediaItem } from "../types";

const FEATURES = ["tfw_timeline_list:", "tfw_follower_count_sunset:true", "tfw_tweet_edit_backend:on", "tfw_refsrc_session:on", "tfw_fosnr_soft_interventions_enabled:on", "tfw_show_birdwatch_pivots_enabled:on", "tfw_show_business_verified_badge:on", "tfw_duplicate_scribes_to_settings:on", "tfw_use_profile_image_shape_enabled:on", "tfw_show_blue_verified_badge:on", "tfw_legacy_timeline_sunset:true", "tfw_show_gov_verified_badge:on", "tfw_show_business_affiliate_badge:on", "tfw_tweet_edit_frontend:on"].join(";");
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

export const xParser: Parser = {
  platform: "x",
  async parse(url, fetcher = fetch): Promise<ParsedContent> {
    const id = url.pathname.match(/\/status(?:es)?\/(\d{4,25})/)?.[1];
    if (!id) throw new ParseError("INVALID_URL", "X 链接缺少帖子 ID", 400);
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    const endpoint = new URL("https://cdn.syndication.twimg.com/tweet-result");
    endpoint.search = new URLSearchParams({ id, lang: "en", features: FEATURES, token }).toString();
    let response: Response;
    try { response = await fetcher(endpoint, { headers: { "user-agent": ua, accept: "application/json" }, signal: AbortSignal.timeout(10000) }); }
    catch { throw new ParseError("UPSTREAM_UNAVAILABLE", "X 数据接口暂时不可访问", 502); }
    if (response.status === 429) throw new ParseError("UPSTREAM_RATE_LIMITED", "X 暂时限制了请求频率", 429);
    if (response.status === 404) throw new ParseError("CONTENT_NOT_FOUND", "帖子不存在或无法公开访问", 404);
    if (!response.ok) throw new ParseError("UPSTREAM_UNAVAILABLE", `X 数据接口返回 ${response.status}`, 502);
    const data = await response.json() as Record<string, any>;
    if (data.__typename === "TweetTombstone" || !data.id_str) throw new ParseError("CONTENT_NOT_FOUND", "帖子不存在或无法公开访问", 404);
    const media: MediaItem[] = (data.mediaDetails || []).map((m: any) => {
      const thumb = m.media_url_https;
      if (m.type === "photo") {
        const original = new URL(thumb);
        original.searchParams.set("name", "orig");
        return { kind: "image", thumbnail: thumb, original: true, watermarkFree: true, variants: [{ label: "原图", url: original.href, width: m.original_info?.width, height: m.original_info?.height }] };
      }
      const variants = (m.video_info?.variants || []).filter((v: any) => v.content_type === "video/mp4" && v.url).map((v: any) => {
        const match = v.url.match(/\/(\d+)x(\d+)\//);
        return { label: match ? `${match[1]}×${match[2]}` : "MP4", url: v.url, mimeType: "video/mp4", width: match ? Number(match[1]) : undefined, height: match ? Number(match[2]) : undefined, bitrate: v.bitrate };
      }).sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      return { kind: m.type === "animated_gif" ? "gif" : "video", thumbnail: thumb, watermarkFree: true, variants };
    }).filter((m: MediaItem) => m.variants.length);
    return { platform: "x", id, sourceUrl: url.href, type: "post", title: "", author: { name: data.user?.name || data.user?.screen_name || "", id: data.user?.screen_name, avatar: data.user?.profile_image_url_https }, text: data.text || "", publishedAt: data.created_at, media, warnings: media.some(m => m.kind === "gif") ? ["X 动图原始格式为 MP4；GIF 转换需要浏览器处理。"] : [] };
  },
};
