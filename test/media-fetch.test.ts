import { expect, it } from "vitest";
import { fetchMedia } from "../src/media-fetch";

it("retries the same original image on a fixed alternate CDN after TLS failure", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    expect(new Headers(init?.headers).get("range")).toBe("bytes=0-31");
    if (calls.length === 1) throw new TypeError("TLS certificate expired");
    return new Response(new Uint8Array([255, 216, 255]), { status: 206 });
  }) as typeof fetch;
  const response = await fetchMedia("https://sns-img-bd.xhscdn.com/file123", { headers: { range: "bytes=0-31" } }, fetcher);
  expect(calls).toEqual(["https://sns-img-bd.xhscdn.com/file123", "https://sns-img-hw.xhscdn.com/file123"]);
  expect(response.status).toBe(206);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([255, 216, 255]);
});

it("detects WebP in octet-stream responses while preserving the file bytes", async () => {
  const bytes = new TextEncoder().encode("RIFF1234WEBPpayload");
  const fetcher = (async () => new Response(bytes, { headers: { "content-type": "application/octet-stream" } })) as typeof fetch;
  const result = await fetchMedia("https://sns-img-bd.xhscdn.com/file123", { method: "GET" }, fetcher);
  expect(result.headers.get("content-type")).toBe("image/webp");
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
});

it("keeps unrelated resources on their signed URL and rejects redirects", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } });
  }) as typeof fetch;
  await expect(fetchMedia("https://pbs.twimg.com/photo.jpg", {}, fetcher)).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
  expect(calls).toEqual(["https://pbs.twimg.com/photo.jpg"]);
});
