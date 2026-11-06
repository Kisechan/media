# 技术调研与许可记录

调研日期：2026-11-01。以下结论来自指定项目的 README、解析源码及 Cloudflare 官方文档。本站代码重新实现解析流程，仅复用公开技术思路。

| 项目 | 阅读的实现 | 可用方案与维护判断 | 许可处理 |
| --- | --- | --- | --- |
| [ucmao/media-parser](https://github.com/ucmao/media-parser) | `src/parsers/xiaohongshu_parser.py`、`src/parsers/zhihu_parser.py`、两份平台逆向文档 | 小红书读取 `window.__INITIAL_STATE__` 并优先 `originVideoKey`；知乎先查公开 API，再读 `js-initialData`。Python、requests、BeautifulSoup 不适合直接搬到 Worker。项目文档明确提示 Cookie 与机房 IP 风控，实际成功率需按环境验证。 | MIT；仅参考字段与流程。 |
| [anhao/x-video-download](https://github.com/anhao/x-video-download) | `src/lib/twitter.ts`、`src/routes/api/parse.ts` | 公开 syndication JSON 与 base36 token 可在 Worker 用 fetch 实现；媒体索引下载和域名白名单适合无状态代理。该接口属于非官方公开端点，限流与格式变更是维护风险。 | MIT；保留技术归属，本站重新实现。 |
| [musistudio/xhs-helper](https://github.com/musistudio/xhs-helper) | README、`app.js` | 小程序从小红书页面获取图片，需小程序域名白名单；直接移植价值较低。 | 仓库未找到根目录 LICENSE；未复制代码。 |
| [paytonison/x-loader](https://github.com/paytonison/x-loader) | README、`x-loader.user.js` | 浏览器用户脚本通过已登录页面和 X 内部 API 取视频；需要页面会话与 DOM，不适合作为匿名 Worker 解析路径。原图 `name=orig` 与码率排序可作交叉验证。 | 仓库 LICENSE 为 Apache-2.0，脚本头标 GPL-3.0；未复制代码。 |
| [Andy-SoulShell/xhs-downloader](https://github.com/Andy-SoulShell/xhs-downloader) | README、`apps/extension/src/feed-detail-parser.ts` | 从 `note.noteDetailMap` 提取正文、作者、图像；浏览器扩展对已登录页面更可靠，完整服务依赖浏览器与本地进程。 | MIT；仅参考数据结构。 |
| [icekale/rednote-downloader](https://github.com/icekale/rednote-downloader) | README、`src/xhs.js` | 桌面 UA 被引导登录时回退移动 UA；图像 `name=orig`、媒体主机约束有参考价值。完整服务依赖 Node 文件系统、Docker 和第三方 API。 | 仓库未找到根目录 LICENSE；未复制代码。 |
| [Prajz/blackhole-web](https://github.com/Prajz/blackhole-web) | README、前端资源处理说明 | 浏览器 CORS 限制说明需要 Worker 代理；HLS 与转码会显著增加复杂度。本站仅提供 MP4 直链，GIF 在浏览器生成。 | 仓库未找到根目录 LICENSE；未复制代码。 |

架构选择：[Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) 推荐新项目使用 Workers Static Assets；[cf 项目文档](https://developers.cloudflare.com/cf/projects/) 提供 `cf build`、`cf previews deploy`。单 Worker 承载静态资源与 API，避免 Pages 与 Worker 之间的跨域配置。按 [Turnstile 官方文档](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) 在服务端校验 token；按 [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) 按 IP 限流；按 [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) 缓存公开解析结果。缓存按数据中心生效，限流为近似值。

免费额度关注点：[Workers subrequest 限制](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/) 在免费计划为每请求 50 次外部子请求。采用免费计划默认限制；资源代理为流式传输，视频仍会消耗平台出口和 Cloudflare 带宽，应继续观察实际用量。
