import { ParseError } from "./types";

const imageHosts = ["sns-img-bd.xhscdn.com", "sns-img-hw.xhscdn.com", "sns-img-qc.xhscdn.com"];

async function detectImageType(response: Response): Promise<Response> {
  if (!response.body || (response.headers.get("content-type") || "").startsWith("image/")) return response;
  const reader = response.body.getReader();
  const first = await reader.read();
  const b = first.value || new Uint8Array();
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  const type = b[0] === 255 && b[1] === 216 ? "image/jpeg" : b[0] === 137 && ascii(1, 4) === "PNG" ? "image/png" : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? "image/webp" : ascii(0, 3) === "GIF" ? "image/gif" : undefined;
  const headers = new Headers(response.headers);
  if (type) headers.set("content-type", type);
  const body = new ReadableStream<Uint8Array>({
    start(controller) { if (first.value) controller.enqueue(first.value); if (first.done) controller.close(); },
    async pull(controller) { const next = await reader.read(); if (next.done) controller.close(); else controller.enqueue(next.value); },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, headers });
}

export async function fetchMedia(url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  const parsed = new URL(url);
  const originalImage = imageHosts.includes(parsed.hostname) && /^\/(?:notes_pre_post\/|spectrum\/)?[a-zA-Z0-9_-]+$/.test(parsed.pathname) && !parsed.search;
  const candidates = originalImage ? [parsed.hostname, ...imageHosts.filter(host => host !== parsed.hostname)].map(host => `https://${host}${parsed.pathname}`) : [url];
  const headers = new Headers(init.headers);
  if (originalImage) headers.set("referer", "https://www.xiaohongshu.com/");
  for (const candidate of candidates) {
    try {
      const response = await fetcher(candidate, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(originalImage ? 5000 : 15000) });
      if (response.ok) return originalImage && init.method !== "HEAD" ? await detectImageType(response) : response;
      await response.body?.cancel();
    } catch { /* Try the next fixed CDN host for the same file. */ }
  }
  throw new ParseError("RESOURCE_UNAVAILABLE", "媒体源暂时不可访问，请稍后重试", 502);
}
