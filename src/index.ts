import { resolveLink } from "./links";
import { xParser } from "./parsers/x";
import { xiaohongshuParser } from "./parsers/xiaohongshu";
import { zhihuParser } from "./parsers/zhihu";
import { ParseError, type ParsedContent } from "./types";
import { signContent, verifyResource } from "./security";

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET?: string;
  RESOURCE_SIGNING_KEY?: string;
  API_KEY?: string;
  PARSE_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> };
  MEDIA_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
const parsers = { x: xParser, xiaohongshu: xiaohongshuParser, zhihu: zhihuParser };
const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const error = (e: ParseError) => json({ ok: false, error: { code: e.code, message: e.message } }, e.status);
function sameOrigin(request: Request): boolean { const origin = request.headers.get("origin"); return !!origin && origin === new URL(request.url).origin; }
async function verifyTurnstile(token: string, request: Request, env: Env): Promise<boolean> {
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY || !token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get("CF-Connecting-IP") || "" }), signal: AbortSignal.timeout(8000) });
    const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
    const testKey = env.ENVIRONMENT !== "production" && env.TURNSTILE_SITE_KEY === "1x00000000000000000000AA";
    return response.ok && result.success === true && (testKey || result.hostname === new URL(request.url).hostname) && (result.action === "parse" || (testKey && (result.action === "test" || !result.action)));
  } catch { return false; }
}
function contentResponse(content: ParsedContent, cache: string): Response { return json({ ok: true, data: content, meta: { cached: cache === "HIT", page: 1 } }, 200, { "x-cache-status": cache }); }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/config.json") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || "", environment: env.ENVIRONMENT });
      if (path === "/api/health") return json({ ok: true, environment: env.ENVIRONMENT });
      if (path === "/api/v1/parse") {
        if (request.method !== "GET" && request.method !== "POST") throw new ParseError("METHOD_NOT_ALLOWED", "仅支持 GET 和 POST", 405);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const limited = await env.PARSE_LIMIT.limit({ key: `parse:${ip}` });
        if (!limited.success) throw new ParseError("RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
        let input: Record<string, unknown>;
        if (request.method === "GET") input = Object.fromEntries(new URL(request.url).searchParams);
        else {
          if (!(request.headers.get("content-type") || "").includes("application/json")) throw new ParseError("INVALID_BODY", "请求体必须是 JSON", 400);
          try { input = await request.json() as Record<string, unknown>; } catch { throw new ParseError("INVALID_BODY", "JSON 格式无效", 400); }
        }
        const link = input.link;
        const platform = input.platform;
        const page = input.page === undefined ? 1 : Number(input.page);
        if (typeof link !== "string" || link.length > 3000) throw new ParseError("INVALID_URL", "链接缺失或过长", 400);
        if (platform !== undefined && !["auto", "x", "xiaohongshu", "zhihu"].includes(String(platform))) throw new ParseError("INVALID_PLATFORM", "平台参数无效", 400);
        if (!Number.isInteger(page) || page !== 1) throw new ParseError("INVALID_PAGE", "当前仅支持第 1 页", 400);
        const isWeb = request.method === "POST" && sameOrigin(request) && request.headers.get("x-client-type") === "web";
        if (isWeb) {
          if (!await verifyTurnstile(String(input.turnstileToken || ""), request, env)) throw new ParseError("TURNSTILE_FAILED", "人机验证失败，请重试", 403);
        } else if (!env.API_KEY || request.headers.get("authorization") !== `Bearer ${env.API_KEY}`) throw new ParseError("UNAUTHORIZED", "程序 API 需要有效的 Bearer API Key", 401);
        if (!env.RESOURCE_SIGNING_KEY) throw new ParseError("NOT_CONFIGURED", "资源签名密钥尚未配置", 503);
        const resolved = await resolveLink(link, typeof platform === "string" ? platform : undefined);
        const cacheKey = new Request(new URL(`/api/internal/cache/v4/${resolved.platform}/${encodeURIComponent(resolved.url.href)}`, request.url));
        const cached = await (caches as any).default.match(cacheKey);
        if (cached) return contentResponse(await cached.json() as ParsedContent, "HIT");
        const content = await signContent(await parsers[resolved.platform].parse(resolved.url), env.RESOURCE_SIGNING_KEY);
        if (!content.text && !content.media.length) throw new ParseError("EMPTY_CONTENT", "平台未返回可用正文或媒体", 502);
        ctx.waitUntil((caches as any).default.put(cacheKey, json(content, 200, { "cache-control": "public, max-age=300" })));
        return contentResponse(content, "MISS");
      }
      if (path.startsWith("/api/v1/resource/")) {
        if (request.method !== "GET" && request.method !== "HEAD") throw new ParseError("METHOD_NOT_ALLOWED", "仅支持 GET 和 HEAD", 405);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await env.MEDIA_LIMIT.limit({ key: `media:${ip}` })).success) throw new ParseError("RATE_LIMITED", "资源请求过于频繁", 429);
        if (!env.RESOURCE_SIGNING_KEY) throw new ParseError("NOT_CONFIGURED", "资源签名密钥尚未配置", 503);
        const resource = await verifyResource(path.slice("/api/v1/resource/".length), env.RESOURCE_SIGNING_KEY);
        const headers = new Headers();
        const range = request.headers.get("range");
        if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("range", range);
        const upstream = await fetch(resource, { method: request.method, headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
        if (!upstream.ok && upstream.status !== 206) throw new ParseError("RESOURCE_UNAVAILABLE", `媒体源返回 ${upstream.status}`, 502);
        const responseHeaders = new Headers();
        for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) { const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value); }
        const inline = new URL(request.url).searchParams.get("inline") === "1";
        responseHeaders.set("content-disposition", `${inline ? "inline" : "attachment"}; filename="media-${Date.now()}"`);
        responseHeaders.set("cache-control", "private, max-age=300");
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
      }
      if (path.startsWith("/api/")) throw new ParseError("NOT_FOUND", "接口不存在", 404);
      return env.ASSETS.fetch(request);
    } catch (cause) {
      if (cause instanceof ParseError) return error(cause);
      console.error("request failed", cause);
      return error(new ParseError("INTERNAL_ERROR", "服务暂时不可用", 500));
    }
  },
};
