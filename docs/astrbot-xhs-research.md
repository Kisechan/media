# AstrBot 小红书原图调研

日期：2026-11-06。当前优先级：小红书公开图文与源文件下载，知乎后续继续。

## 已阅读的项目

| 项目 | 源码证据 | 可复用思路与边界 |
| --- | --- | --- |
| [vacacia/astrbot_plugin_link_resolver](https://github.com/vacacia/astrbot_plugin_link_resolver/tree/5562b96b5b528a78bd9851197f4ea35d3285d9e4) | `core/xiaohongshu/extractor.py`、`handler.py`、README、LICENSE | 页面提取使用匿名请求，完整保留分享参数，优先 explore，回退 discovery；从 `__INITIAL_STATE__` 读取图片 ID。原文件下载尝试 bd、qc、hw 三个 CDN 和 CI；CI PNG 是转换结果。源码采用 AGPL-3.0，本项目独立实现网络请求与候选主机逻辑，未复制其代码。 |
| [bytedo/astrbot_plugin_xhs](https://github.com/bytedo/astrbot_plugin_xhs/tree/1b844e1ebd7cacbdfd4d5cebb39e518af0db5d4b) | `main.py`、README、LICENSE | 解析委托给配置中的外部 API，插件本身没有笔记提取或登录限制处理实现。MIT。 |
| [xuanxuan123xuan/astrbot_plugin_share_forward](https://github.com/xuanxuan123xuan/astrbot_plugin_share_forward/blob/master/_conf_schema.json) | 公开配置 schema | 需要配置含 `a1` 和 `web_session` 的 Cookie。这一路线依赖用户授权会话，当前项目继续优先匿名公开页面。 |

结论：这些插件采取匿名 SSR、用户会话或外部 API 三类路径。匿名 SSR 的成功率仍受链接有效性与出口网络影响；单一 UA 不能保证 Cloudflare 出口成功。原文件路径为 `https://<固定图片CDN>/<fileId>`，保持存储文件字节。下载转码 PNG 会改变文件格式与字节。

## 实际验证

样本：[公开短链](https://xhslink.cn/o/8tGdJnRlIgq)，笔记 ID `6ad98597000000003102fdbe`，标题“翻了翻杨洋的手机相册2”。本机匿名请求取得 20 张图片元数据；本地 workerd 解析 API 与签名资源代理下载 20/20，实际文件为 1 张 JPEG、19 张 WebP。

首图 1320×1760、385801 字节。bd、hw CDN 直接下载和 workerd 代理下载 SHA-256 一致：`e544e5eddc4f3190b333b0f1ad82591d6072a646299616f3bd43f739011b6403`。

19/20 文件尺寸与笔记元数据相符。第 17 张为实况照片静态文件：元数据 1826×2434，bd、hw、CI 返回的文件均为 1080×1440 WebP。这表明裸 fileId 返回可用静态存储文件，其分辨率仍可能低于笔记标注尺寸；作者上传文件级别的完整性尚待验证。页面将其标为“实况静态源图”。

实现增加固定图片 CDN 的失败回退、文件头 MIME 检测和匹配扩展名。所有图片均流式返回，保持文件字节，不经转码；签名验证和目标域名限制继续生效。

复测命令：

```sh
node --env-file=.dev.vars scripts/verify-xhs-originals.mjs http://localhost:8787 https://xhslink.cn/o/8tGdJnRlIgq /tmp/xhs-verified-originals
file /tmp/xhs-verified-originals/*
```

以上为本地 workerd 证据。Cloudflare 预览环境的连通性与同一路径成功率仍需验证，正式部署门槛继续保留。
