# 验证记录

日期：2026-11-01 至 2026-11-06；环境：macOS + 本地 `workerd`、Cloudflare [预览环境](https://media-parser-validation-media-parser-tool.kisechan.workers.dev)。以下均为真实公开链接与真实 HTTP 请求；单元测试中的 fixture 不计入平台成功率。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 构建与类型 | 通过 | `npm run check`；回归测试 8/8。免费计划拒绝自定义 `limits`，移除后预览上传成功。 |
| X 原图 | 通过 | [NASA 公开帖子](https://x.com/NASA/status/2040059770237849635) 返回正文、作者、5568×3712 原图；浏览器实际解码分辨率一致。 |
| X 视频 | 通过 | [SpaceX 公开帖子](https://x.com/SpaceX/status/2082186658162626898) 返回两个视频和 3840×2160 至 480×270 清晰度；代理 HEAD 为 `200 video/mp4`，原图 HEAD 为 `200 image/jpeg`。 |
| 小红书短链 | 本地解析通过；预览受限 | [公开视频短链](https://xhslink.cn/o/8tGdJnRlIgq) 在本地 workerd 返回标题、作者、179 字正文和媒体；视频原始流 HEAD 为 `200 video/mp4`，另两条流在修复 HTTP→HTTPS 后为 `200 video/mp4`。[另一公开短链](https://xhslink.cn/o/1NYvDyb6My4) 返回标题、作者、32 字正文和可访问的 H265 视频。Cloudflare 预览同一短链返回 `LOGIN_REQUIRED`。 |
| 小红书原图 | 本地源站通过；预览受限 | `sns-img-qc.xhscdn.com` 在 11 月 1 日返回过期证书错误；同一路径换用 `sns-img-bd.xhscdn.com` 后 HEAD 为 200、159419 字节，实际字节以 JPEG `FF D8 FF` 开头。已切换解析器的原图域名；预览环境仍受笔记访问风控。 |
| 知乎回答与文章 | 未通过 | [公开回答](https://www.zhihu.com/question/2062922378158649938/answer/2070507772819591389) 的 API 返回 403 `need_login`，网页返回 `zse_ck` 风控页；[公开文章](https://zhuanlan.zhihu.com/p/2089097318427530874) 在本地及预览环境也返回 `LOGIN_REQUIRED`。 |
| 网页端到端 | X 原图通过 | Playwright 在本地真实页面提交 X 链接，展示正文与下载项，原图解码为 5568×3712。手机宽度 390 像素时页面 `scrollWidth=390`。 |
| Turnstile | 预览通过 | 官方测试密钥与 dummy token 的网页 POST 为 200；缺少 token 返回 403 `TURNSTILE_FAILED`。正式 widget 尚未配置。 |
| Rate Limiting | 本地通过；预览待确认 | 本地 workerd 连续 25 次请求：前 20 次参数错误 400，后 5 次限流 429。预览连续 25 次请求均为 401，尚未观察到 429；Cloudflare 官方说明限流为近似计数。 |
| Cache | 预览通过 | 同一 X 链接的重复请求返回 `X-Cache-Status: HIT`。 |
| 参数与资源签名 | 通过 | 未授权 401、`page=2` 返回 400、平台不匹配 400、伪造资源 ID 返回 403。 |
| GIF | 通过 | Playwright 对 SpaceX 实际视频点击转换，下载 `media-1.gif`；`file` 确认为 GIF89a，`ffprobe` 读出 320×180、32 帧，文件 473 KB。 |

正式部署门槛状态：未满足。Cloudflare 预览出口对小红书、知乎的真实内容请求触发登录或风控；知乎在本地亦受限。预览限流及正式 Turnstile widget 仍需验收。2026-11-06 从本机访问预览地址发生连接超时，需恢复网络后复核；此前预览验证结果保留。

2026-11-06 后续排查：知乎 `api.zhihu.com/answers/2070507772819591389` 再次返回 HTTP 403、错误码 40353、`need_login=true`。对照参考项目源码修复想法的数组正文、图片与多视频提取，并修复 HTML 图片属性顺序导致误选缩略图的问题；新增两项 fixture 回归验证。上述回归仅证明字段处理，知乎真实端到端验收仍待通过。
