import { ParseError, type MediaVariant, type ParsedContent } from "./types";

const mediaHosts = ["pbs.twimg.com", "video.twimg.com"];
export function allowedMedia(url: string): boolean {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && (mediaHosts.includes(parsed.hostname) || [".xhscdn.com", ".zhimg.com", ".vzuu.com"].some(suffix => parsed.hostname.endsWith(suffix))); }
  catch { return false; }
}
function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
export async function signResource(url: string, secret: string): Promise<string> {
  if (!allowedMedia(url)) throw new ParseError("RESOURCE_BLOCKED", "媒体域名未列入允许列表", 502);
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ url, exp: Date.now() + 15 * 60_000 })));
  return `${payload}.${await hmac(payload, secret)}`;
}
export async function verifyResource(id: string, secret: string): Promise<string> {
  const [payload, signature] = id.split(".");
  if (!payload || !signature || id.length > 6000 || await hmac(payload, secret) !== signature) throw new ParseError("INVALID_RESOURCE", "资源标识无效", 403);
  let item: any;
  try { item = JSON.parse(new TextDecoder().decode(fromBase64url(payload))); } catch { throw new ParseError("INVALID_RESOURCE", "资源标识无效", 403); }
  if (!item.exp || item.exp < Date.now() || !allowedMedia(item.url)) throw new ParseError("INVALID_RESOURCE", "资源标识已过期或无效", 403);
  return item.url;
}
export async function signContent(result: ParsedContent, secret: string): Promise<ParsedContent> {
  for (const media of result.media) for (const variant of media.variants) {
    if (allowedMedia(variant.url)) variant.downloadUrl = `/api/v1/resource/${await signResource(variant.url, secret)}`;
    else result.warnings.push(`媒体域名未受支持：${new URL(variant.url).hostname}`);
  }
  return result;
}
