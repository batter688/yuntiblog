# 云梯笔记：Notion → Netlify Blobs

这个项目使用 Notion 作为内容后台，并将页面运行时内容存储在 Netlify Blobs。

内容更新流程：

```text
Notion Webhook
→ 普通 Function 校验签名
→ Background Function 合并事件并读取 Notion
→ HTML、搜索数据和 RSS 写入 Netlify Blobs
→ 动态页面 Function 从当前 Blobs 版本返回内容
```

Notion 新增、修改或删除文章后，不再触发 Netlify 生产部署。只有代码、样式、模板或 Function 发生变化时才需要部署。

## 目录说明

- `scripts/site-generator.mjs`：共享的 Notion 读取和整站生成器。
- `scripts/build.mjs`：本地静态构建，用于开发和回退验证。
- `scripts/build-runtime.mjs`：Netlify 部署构建，只复制 CSS、JavaScript 和静态 404。
- `netlify/functions/notion-webhook.mjs`：校验 Notion Webhook 并排队同步。
- `netlify/functions/sync-notion.mjs`：受保护的手动/内部同步入口。
- `netlify/functions/sync-notion-background.mjs`：后台读取 Notion 并写入 Blobs。
- `netlify/functions/site.mjs`：从 Blobs 返回 HTML、JSON 和 RSS。
- `netlify/functions/media.mjs`：从 Blobs 返回内容哈希图片。

## 本地开发

1. 复制 `.env.example` 为 `.env`。
2. 在 Notion Integration 中创建只读 Token，并把“云梯Blog”数据源分享给该 Integration。
3. 填入 `NOTION_TOKEN` 和 `NOTION_DATA_SOURCE_ID`。
4. 执行 `npm install`。
5. 执行 `npm run build`，在本地生成完整静态站点。
6. 执行 `npm run preview` 预览 `dist`。

```powershell
npm install
npm test
npm run build
npm run preview
```

本地静态构建仍只读取 Notion，不会修改或删除 Notion 页面。

## Netlify 构建设置

仓库本身就是站点根目录，因此 Base directory 留空。

- Build command：`npm run build:runtime`
- Publish directory：`dist`
- Functions directory：`netlify/functions`

这些设置已经写入 `netlify.toml`。Netlify 部署期间不会读取 Notion，也不会生成文章页面。

## Netlify 环境变量

在 Netlify 项目的 Environment variables 中添加：

| 变量 | 用途 |
| --- | --- |
| `NOTION_TOKEN` | 后台同步时读取 Notion |
| `NOTION_DATA_SOURCE_ID` | 要同步的数据源 ID |
| `SITE_URL` | 正式站点地址，用于 RSS |
| `SITE_NAME` | 网站名称 |
| `SYNC_TOKEN` | 保护手动同步接口和内部后台任务 |
| `SYNC_DEBOUNCE_MS` | 合并连续 Webhook 事件的等待时间，推荐 `5000` |
| `NOTION_WEBHOOK_VERIFICATION_TOKEN` | 验证 Notion Webhook HMAC 签名，首次创建订阅后再填写 |

`NETLIFY_BUILD_HOOK` 已经不再使用，可以从 Netlify 环境变量中删除。

生成 `SYNC_TOKEN`：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

不要把真实 Token 写入 Git、`.env.example` 或 `netlify.toml`。

## 第一次上线

### 1. 部署代码

连接 GitHub 仓库并部署。部署成功时只会发布静态资源和 Functions。

此时如果 Blobs 中还没有内容，网站会显示“内容正在同步”，这是正常状态。

### 2. 手动执行第一次同步

先确认 `NOTION_TOKEN`、`NOTION_DATA_SOURCE_ID` 和 `SYNC_TOKEN` 已经添加到 Netlify，并且环境变量变更已经通过一次部署生效。

在 PowerShell 中执行：

```powershell
$site = "https://你的域名"
$syncToken = "你的 SYNC_TOKEN"
Invoke-RestMethod `
  -Method Post `
  -Uri "$site/api/sync-notion" `
  -Headers @{ Authorization = "Bearer $syncToken" } `
  -ContentType "application/json" `
  -Body '{"reason":"initial-sync"}'
```

正常响应：

```json
{
  "ok": true,
  "syncQueued": true
}
```

接口返回 `202` 只表示后台任务已经排队。随后在 Netlify Functions 日志中查看 `sync-notion-background`，完成时会出现：

```text
Blob sync complete: generation ..., 4 posts.
```

刷新网站即可读取 Blobs 中的当前版本。

## 配置 Notion Webhook

Webhook 地址：

```text
https://你的域名/api/notion-webhook
```

建议订阅与博客相关的页面创建、内容更新、属性更新、删除和恢复事件。

首次创建订阅时：

1. Notion 向 Webhook 发送 `verification_token`。
2. 在 Netlify 的 `notion-webhook` Function 日志中找到：

   ```text
   NOTION_WEBHOOK_VERIFICATION_TOKEN=...
   ```

3. 把该值添加到 Netlify 环境变量 `NOTION_WEBHOOK_VERIFICATION_TOKEN`。
4. 在 Notion Integration 页面粘贴同一个值完成 Verify。
5. 让环境变量通过一次部署生效。

从此以后，Notion 内容变化只触发后台同步，不触发 Netlify Deploy。

## 同步一致性和缓存

- 每次同步使用新的 generation 写入完整页面集合。
- 只有所有页面写入成功后才更新 `current` 指针，避免半新半旧。
- 保留最近 3 个页面 generation，旧版本自动清理。
- 图片按内容 SHA-256 哈希保存，重复图片不会重复写入。
- 动态页面使用 Netlify CDN 缓存，通常最多约 60 秒看到更新。
- 404 不缓存，因此新发布文章的地址不会长期保留旧的 404。
- 连续 Notion 事件默认等待 5 秒并合并，避免重复同步。

## 发布规则

只有 `type=Post` 且 `status=Published` 的页面会出现在正式站点。`Draft` 和 `Invisible` 页面不会出现在首页、文章页、搜索、归档、分类、标签和 RSS 中。

## 常用命令

```powershell
# 单元测试
npm test

# 本地完整静态构建（会读取 Notion）
npm run build

# Netlify 运行时构建（不会读取 Notion）
npm run build:runtime

# 本地预览静态构建结果
npm run preview
```

## 故障检查

### 网站显示“内容正在同步”

说明 `current` 指针还不存在。检查第一次同步是否执行，以及 Background Function 日志中是否有 Notion 权限或 Blobs 写入错误。

### 手动同步返回 401

确认请求头是：

```text
Authorization: Bearer 你的SYNC_TOKEN
```

并确认环境变量变更已经生效。

### Webhook 返回 401

确认 `NOTION_WEBHOOK_VERIFICATION_TOKEN` 与 Notion 订阅生成的 token 完全一致。

### 内容没有立即更新

先等待最多约 60 秒。如果 Background Function 没有新的日志，检查 Notion Webhook 投递记录；如果有错误日志，按日志中的 Notion API 或 Blobs 错误处理。
