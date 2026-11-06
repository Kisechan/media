const base = process.argv[2];
if (!base || !process.env.API_KEY) throw new Error("Usage: node --env-file=.dev.vars scripts/probe-preview.mjs <preview-url>");
const samples = [
  ["xhs-video-fresh", "https://xhslink.cn/o/8tGdJnRlIgq"],
  ["xhs-video-other", "https://xhslink.cn/o/5cX2A3Z3mQn"],
  ["xhs-image-fresh", "https://xhslink.cn/o/1NYvDyb6My4"],
  ["xhs-token", "https://www.xiaohongshu.com/explore/6455b3d7000000000800e27f?xsec_token=ABj6wOII3wKf1doBy-UiXlhHC-HP-A9ammCgjhvhiT1L8%3D&xsec_source=pc_feed"],
  ["xhs-unsigned", "https://www.xiaohongshu.com/explore/6662e902000000000d00f92b"],
  ["zhihu-answer", "https://www.zhihu.com/question/2062922378158649938/answer/2070507772819591389"],
  ["zhihu-article", "https://zhuanlan.zhihu.com/p/2089097318427530874"],
  ["x-photo", "https://x.com/NASA/status/2040059770237849635"],
  ["x-video", "https://x.com/SpaceX/status/2082186658162626898"],
];
for (const [name, link] of samples.filter(([name]) => !process.argv[3] || name === process.argv[3])) {
  const url = new URL("/api/v1/parse", base);
  url.searchParams.set("link", link);
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.API_KEY}` } });
    const result = await response.json();
    const media = [];
    for (const item of result.data?.media || []) {
      for (const variant of item.kind === "video" ? item.variants : item.variants?.slice(0, 1) || []) {
        const resource = await fetch(new URL(variant.downloadUrl, base), { method: "HEAD" });
        media.push({ kind: item.kind, label: variant.label, host: new URL(variant.url).host, status: resource.status, type: resource.headers.get("content-type"), length: resource.headers.get("content-length") });
      }
    }
    console.log(JSON.stringify({ name, status: response.status, cache: response.headers.get("x-cache-status"), code: result.error?.code, title: result.data?.title, author: result.data?.author?.name, textLength: result.data?.text?.length, media }));
  } catch (error) {
    console.log(JSON.stringify({ name, error: String(error) }));
  }
}
