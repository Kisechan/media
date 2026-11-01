# 架构与 API

浏览器静态页面和 API 同源运行于一个 Worker。`src/links.ts` 识别并校验允许的分享域名，手动解析短链后再次检查目标域名。三个 `src/parsers/` 模块各自输出 `ParsedContent`。`src/index.ts` 执行 API 鉴权、Turnstile、限流、缓存和错误处理。

`GET /api/v1/parse?platform=zhihu&link=<encoded URL>&page=1` 供程序调用；`POST /api/v1/parse` 接收 `{ "link": "...", "platform": "auto", "page": 1 }`。程序请求使用 `Authorization: Bearer <API_KEY>`。网页 POST 使用同源 `Origin`、`x-client-type: web` 和 `turnstileToken`，由服务端向 Turnstile siteverify 验证。POST 也可由程序 API Key 调用。

成功结构为 `{ "ok": true, "data": { "platform", "id", "sourceUrl", "type", "title", "author", "text", "media", "warnings" }, "meta": { "cached", "page" } }`。失败结构为 `{ "ok": false, "error": { "code", "message" } }`。媒体项有 `kind`、`thumbnail`、`watermarkFree` 和按清晰度排列的 `variants`。每个变体包含原始 `url`、可选分辨率、码率、MIME 与 `downloadUrl`。

资源接口 `/api/v1/resource/<signed-id>` 的签名包含原始媒体 URL 与 15 分钟有效期，验证 HMAC 后再校验 HTTPS 与媒体域名。媒体代理支持 HEAD 和 Range；`?inline=1` 用于预览，默认下载。没有任意 URL 参数代理。解析缓存为 5 分钟，过期资源签名不进入长期存储。

前端使用 Vite + 原生 TypeScript。GIF 由浏览器读取视频前 4 秒并编码为最多 32 帧、最大边长 320 像素的文件，避免 Worker 转码与大文件处理。高分辨率视频保留 MP4 下载选项。GIF 转换依赖浏览器能读取源视频并支持画布绘制。
