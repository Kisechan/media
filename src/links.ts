import { ParseError, type Platform } from "./types";

const hosts: Record<Platform, string[]> = {
  xiaohongshu: ["xiaohongshu.com", "www.xiaohongshu.com", "xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn"],
  zhihu: ["zhihu.com", "www.zhihu.com", "zhuanlan.zhihu.com", "link.zhihu.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "t.co"],
};
const shortHosts = new Set(["xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn", "link.zhihu.com", "t.co"]);

export function extractUrl(input: string): URL {
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) throw new ParseError("INVALID_URL", "请输入公开内容链接", 400);
  try {
    const url = new URL(match[0].replace(/[),.;!?，。]+$/, ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url;
  } catch { throw new ParseError("INVALID_URL", "链接格式无效", 400); }
}

export function platformOf(url: URL): Platform {
  for (const [platform, allowed] of Object.entries(hosts)) {
    if (allowed.includes(url.hostname.toLowerCase())) return platform as Platform;
  }
  throw new ParseError("UNSUPPORTED_PLATFORM", "目前支持小红书、知乎和 X/Twitter", 400);
}

export async function resolveLink(input: string, requested?: string | null, fetcher: typeof fetch = fetch): Promise<{ platform: Platform; url: URL }> {
  let url = extractUrl(input);
  let platform = platformOf(url);
  if (requested && requested !== "auto" && requested !== platform) throw new ParseError("PLATFORM_MISMATCH", "平台参数与链接不一致", 400);
  if (shortHosts.has(url.hostname.toLowerCase())) {
    try {
      const response = await fetcher(url.toString(), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
      const location = response.headers.get("location");
      if (!location) throw new Error("missing location");
      const target = new URL(location, url);
      if (platformOf(target) !== platform || target.pathname === "/" || target.pathname === "") throw new Error("unexpected redirect target");
      url = target;
    } catch { throw new ParseError("SHORT_LINK_FAILED", "短链跳转失败或目标站点受限", 502); }
  }
  platform = platformOf(url);
  return { platform, url };
}
