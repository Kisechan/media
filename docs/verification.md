# 验证记录

日期：2026-11-01；环境：macOS + Cloudflare `workerd` 本地开发运行时，由 `npx cf dev` 启动。以下均为真实公开链接与真实 HTTP 请求；单元测试中的 fixture 不计入平台成功率。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 构建与类型 | 通过 | `npx tsc --noEmit`、`npx cf build`；回归测试 5/5。 |
| X 原图 | 通过 | [NASA 公开帖子](https://x.com/NASA/status/2040059770237849635) 返回正文、作者、5568×3712 原图；浏览器实际解码分辨率一致。 |
| X 视频 | 通过 | [SpaceX 公开帖子](https://x.com/SpaceX/status/2082186658162626898) 返回两个视频和 3840×2160 至 480×270 清晰度；代理 HEAD 为 `200 video/mp4`，原图 HEAD 为 `200 image/jpeg`。 |
| 小红书短链 | 未通过 | 公开样本 `xhslink.com/a/7N4GytOVgen5` 跳转到站点首页；`xhslink.com/o/1WiQ1QI6Uc0` HEAD 为 404。 |
| 小红书长链 | 未通过 | 已测试带 `xsec_token` 的公开文档样本及 `discovery/item` 样本；页面未返回可识别的笔记状态。需要新鲜有效的公开分享链接及 Cloudflare 预览环境复测。 |
| 知乎文章 | 未通过 | [公开文章](https://zhuanlan.zhihu.com/p/262266851) 的 API 与网页回退在当前环境触发 403 访问限制，返回 `LOGIN_REQUIRED`。需预览环境复测。 |
| 网页端到端 | X 原图通过 | Playwright 在本地真实页面提交 X 链接，展示正文与下载项，原图解码为 5568×3712。手机宽度 390 像素时页面 `scrollWidth=390`。 |
| Turnstile | 开发模式通过 | 官方测试站点密钥与测试 Secret，带测试 token 的 POST 成功；缺少 token 返回 `TURNSTILE_FAILED`。真实生产 widget 尚未配置。 |
| Rate Limiting | 通过 | 本地 workerd 连续 25 次请求：前 20 次参数错误 400，后 5 次限流 429。 |
| Cache | 通过 | 同一 X 链接的重复请求返回 `X-Cache-Status: HIT`。 |
| 参数与资源签名 | 通过 | 未授权 401、`page=2` 返回 400、平台不匹配 400、伪造资源 ID 返回 403。 |
| GIF | 通过 | Playwright 对 SpaceX 实际视频点击转换，下载 `media-1.gif`；`file` 确认为 GIF89a，`ffprobe` 读出 320×180、32 帧，文件 473 KB。 |

正式部署门槛状态：未满足。主要阻断为小红书与知乎真实解析和资源验证，以及 Cloudflare 预览环境测试、真实 Turnstile widget 配置。
