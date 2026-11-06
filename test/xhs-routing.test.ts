import { expect, it } from "vitest";
import { platformOf } from "../src/links";
import { xiaohongshuParser } from "../src/parsers/xiaohongshu";

it("accepts the official international domain and preserves share parameters on fallback", async () => {
  const id = "6ad98597000000003102fdbe";
  expect(platformOf(new URL(`https://www.rednote.com/discovery/item/${id}`))).toBe("xiaohongshu");
  const urls: URL[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.hostname !== "www.rednote.com") return new Response(null, { status: 403 });
    const state = { note: { noteDetailMap: { [id]: { note: { noteId: id, desc: "公开正文", imageList: [{ fileId: "image123", width: 1320, height: 1760 }] } } } } };
    return new Response(`<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`);
  }) as typeof fetch;
  const result = await xiaohongshuParser.parse(new URL(`https://www.xiaohongshu.com/discovery/item/${id}?xsec_token=valid&xsec_source=app_share`), fetcher);
  expect(urls).toHaveLength(2);
  expect(urls[1].search).toBe("?xsec_token=valid&xsec_source=app_share");
  expect(result.text).toBe("公开正文");
  expect(result.media[0].variants[0]).toMatchObject({ width: 1320, height: 1760 });
});
