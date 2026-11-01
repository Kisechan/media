# 部署配置

当前状态：仅本地开发环境已运行；正式环境验收门槛尚未通过。

1. `npm install`、`npm test`、`npm run check`。
2. 使用 `cf auth login` 为本机 CLI 授权；连接器登录状态不会自动传给 CLI。
3. 在 Cloudflare 配置 `TURNSTILE_SECRET`、`RESOURCE_SIGNING_KEY` 和 `API_KEY`。签名密钥使用至少 32 字节随机值。正式环境还需创建真实 Turnstile widget，把站点密钥写入 `cloudflare.config.ts` 中的生产 `TURNSTILE_SITE_KEY` 配置。测试密钥仅供开发和预览使用。
4. 执行 `npx cf previews deploy media-parser-validation`，取得预览地址后使用真实公开内容链接验收三平台的正文与媒体访问。检查 Turnstile、限流、缓存和前端。
5. 三平台核心功能及资源均通过后，检查账户计划与用量，再执行 `npx cf deploy`。部署后在正式地址回归测试。

本地 `.dev.vars` 已加入 `.gitignore`，仅供测试，正式 Secret 应通过 Cloudflare 安全配置上传。程序 API Key 仅通过请求头传递。预览地址公开可访问，应使用独立测试配置。
