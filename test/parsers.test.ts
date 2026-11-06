import { describe, expect, it } from "vitest";
import { resolveLink } from "../src/links";
import { xParser } from "../src/parsers/x";
import { xiaohongshuParser } from "../src/parsers/xiaohongshu";
import { zhihuParser } from "../src/parsers/zhihu";
import { allowedMedia, signResource, verifyResource } from "../src/security";

const responder = (body: unknown, status = 200) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;

describe("public content parsing", () => {
  it("keeps a short link's signed destination and rejects wrong hosts", async () => {
    const target = "https://www.xiaohongshu.com/explore/68e66fef0000000004023fdb?xsec_token=abc&xsec_source=pc_share";
    const fetcher = (async () => new Response(null, { status: 302, headers: { location: target } })) as typeof fetch;
    const result = await resolveLink("分享 https://xhslink.cn/o/example", undefined, fetcher);
    expect(result.url.href).toBe(target);
    await expect(resolveLink("https://example.com/anything")).rejects.toMatchObject({ code: "UNSUPPORTED_PLATFORM" });
  });
  it("extracts original X photos and ordered MP4 qualities", async () => {
    const tweet = { id_str: "2082186658162626898", text: "Landing burn", user: { name: "SpaceX" }, mediaDetails: [
      { type: "photo", media_url_https: "https://pbs.twimg.com/media/sample.jpg", original_info: { width: 4000, height: 2000 } },
      { type: "video", media_url_https: "https://pbs.twimg.com/thumb.jpg", video_info: { variants: [
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
        { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/vid/640x360/a.mp4" },
        { content_type: "video/mp4", bitrate: 2000000, url: "https://video.twimg.com/vid/1280x720/b.mp4" },
      ] } },
    ] };
    const result = await xParser.parse(new URL("https://x.com/SpaceX/status/2082186658162626898"), responder(tweet));
    expect(result.media[0].variants[0].url).toContain("name=orig");
    expect(result.media[1].variants.map(v => v.label)).toEqual(["1280×720", "640×360"]);
  });
  it("uses signed XHS note state and prefers origin video", async () => {
    const id = "68e66fef0000000004023fdb";
    const state = { note: { noteDetailMap: { [id]: { note: { noteId: id, title: "笔记标题", desc: "正文", user: { nickname: "作者" }, imageList: [{ fileId: "image-id" }], video: { consumer: { originVideoKey: "pre_post/origin" }, media: { stream: { h264: [{ streamType: 259, masterUrl: "https://sns-video-v2.xhscdn.com/watermarked.mp4" }] } } } } } } } };
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script>`;
    const result = await xiaohongshuParser.parse(new URL(`https://www.xiaohongshu.com/explore/${id}?xsec_token=abc`), responder(html));
    expect(result.text).toBe("正文");
    expect(result.media[0].variants[0].url).toContain("sns-img-bd.xhscdn.com/image-id");
    expect(result.media[1].variants[0].url).toContain("pre_post/origin");
  });
  it("drops expired XHS video URLs and upgrades stream URLs to HTTPS", async () => {
    const id = "68e66fef0000000004023fdb";
    const note = { noteId: id, title: "视频", desc: "正文", video: { consumer: { originVideoKey: "pre_post/expired" }, media: { stream: { h264: [{ masterUrl: "http://sns-video-v6.xhscdn.com/live.mp4", width: 720, height: 960 }] } } } };
    const html = `<script>window.__INITIAL_STATE__=${JSON.stringify({ note: { noteDetailMap: { [id]: { note } } } })}</script>`;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== "HEAD") return new Response(html);
      return new Response(null, { status: String(input).includes("expired") ? 404 : 200 });
    }) as typeof fetch;
    const result = await xiaohongshuParser.parse(new URL(`https://www.xiaohongshu.com/explore/${id}?xsec_token=valid`), fetcher);
    expect(result.media.find(item => item.kind === "video")?.variants.map(item => item.url)).toEqual(["https://sns-video-v6.xhscdn.com/live.mp4"]);
  });
  it("extracts Zhihu article body, image and author", async () => {
    const article = { title: "文章标题", content: '<p>真实正文</p><img data-original="https://picx.zhimg.com/original.jpg">', author: { name: "作者" } };
    const result = await zhihuParser.parse(new URL("https://zhuanlan.zhihu.com/p/262266851"), responder(article));
    expect(result.text).toBe("真实正文");
    expect(result.media[0].variants[0].url).toBe("https://picx.zhimg.com/original.jpg");
  });
  it("prefers Zhihu original images regardless of attribute order", async () => {
    const content = '<img data-original="https://picx.zhimg.com/original.jpg" src="https://picx.zhimg.com/thumb.jpg">';
    const result = await zhihuParser.parse(new URL("https://zhuanlan.zhihu.com/p/123"), responder({ content }));
    expect(result.media[0].variants[0].url).toBe("https://picx.zhimg.com/original.jpg");
  });
  it("preserves text, images and multiple videos in Zhihu pins", async () => {
    const content = [
      { type: "text", content: "<p>想法正文</p>" },
      { type: "image", url: "https://picx.zhimg.com/pin.jpg" },
      ...[1, 2].map(id => ({ type: "video", playlist: { hd: { play_url: `https://vd.vzuu.com/${id}.mp4` } } })),
    ];
    const result = await zhihuParser.parse(new URL("https://www.zhihu.com/pin/123"), responder({ content }));
    expect(result.text).toBe("想法正文");
    expect(result.media.map(item => item.kind)).toEqual(["image", "video", "video"]);
    expect(result.media[0].variants[0].url).toBe("https://picx.zhimg.com/pin.jpg");
  });
});

describe("signed resource access", () => {
  it("allows platform CDNs and rejects arbitrary destinations and modified signatures", async () => {
    const secret = "local-test-signing-key";
    const url = "https://video.twimg.com/a.mp4";
    expect(allowedMedia("https://video.twimg.com.evil.example/a.mp4")).toBe(false);
    expect(allowedMedia(url)).toBe(true);
    const signed = await signResource(url, secret);
    expect(await verifyResource(signed, secret)).toBe(url);
    await expect(verifyResource(`${signed}x`, secret)).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
  });
});
