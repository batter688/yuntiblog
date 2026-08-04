# 云梯笔记：Notion → Netlify

这个项目在构建时读取 Notion，将已发布内容生成到 `dist`，再由 Netlify 托管。Notion 内容变化后，Webhook 会调用 Netlify Build Hook，触发一次新的构建和部署。

## 本地构建

1. 复制 `.env.example` 为 `.env`。
2. 在 Notion Integration 中创建只读 Token，并把“云梯Blog”数据库/数据源分享给该 Integration。
3. 填入 `NOTION_TOKEN` 和 `NOTION_DATA_SOURCE_ID`。
4. 执行 `npm run build`。
5. 执行 `npm run preview` 预览 `dist`。

构建脚本只读取 Notion，不会创建、修改或删除 Notion 页面。

## Netlify 部署配置

如果代码仓库的根目录不是本目录（例如仓库根目录下还有 `admin-web`、`docs`、`yuntiblog`），在 Netlify 导入仓库时设置：

- Base directory：`yuntiblog`
- Build command：`npm run build`
- Publish directory：`dist`
- Functions directory：`netlify/functions`（已由 `netlify.toml` 配置）

在 Netlify 项目环境变量中添加：

| 变量 | 用途 | 推荐作用域 |
| --- | --- | --- |
| `NOTION_TOKEN` | 构建时读取 Notion | Builds |
| `NOTION_DATA_SOURCE_ID` | 要读取的数据源 ID | Builds |
| `SITE_URL` | 正式站点地址，用于 RSS 和绝对链接 | Builds |
| `SITE_NAME` | 网站名称 | Builds |
| `NETLIFY_BUILD_HOOK` | Webhook Function 触发重新部署 | Functions |
| `NOTION_WEBHOOK_VERIFICATION_TOKEN` | 验证 Notion webhook 签名 | Functions |

如果当前 Netlify 套餐不支持变量作用域，保留默认的 All scopes 即可。不要把真实 Token 写入 Git 仓库或 `netlify.toml`。

## 配置 Notion 自动同步

### 1. 首次部署

先把仓库连接到 Netlify 并完成一次成功部署。部署完成后，Webhook 地址为：

```text
https://你的域名/api/notion-webhook
```

### 2. 创建 Netlify Build Hook

进入 Netlify：Project configuration → Build & deploy → Continuous deployment → Build hooks。

创建一个 Build Hook，例如命名为 `Notion content updated`，选择生产分支，然后把生成的 URL 保存到环境变量 `NETLIFY_BUILD_HOOK`。

### 3. 创建 Notion Webhook Subscription

进入 Notion Integration 的 Webhooks 设置，新增订阅：

- URL：`https://你的域名/api/notion-webhook`
- 事件：至少选择页面内容、页面属性、页面创建、页面删除/恢复等与博客发布相关的事件
- API version：`2025-09-03`

创建订阅后，Notion 会发送一次包含 `verification_token` 的请求。

### 4. 完成验证

1. 在 Netlify 的 Functions 日志中打开 `notion-webhook` 日志。
2. 找到 `NOTION_WEBHOOK_VERIFICATION_TOKEN=...`。
3. 把等号后的值添加为 Netlify 环境变量 `NOTION_WEBHOOK_VERIFICATION_TOKEN`。
4. 回到 Notion Webhooks 页面，把同一个 token 粘贴到 Verify 对话框中。
5. 重新部署一次站点，让 Function 使用新环境变量。

验证完成后，每次 Notion 发送内容变化事件，Function 都会校验 `X-Notion-Signature`，然后触发新的 Netlify 构建。

## 发布规则

只有 `type=Post` 且 `status=Published` 的页面会生成到正式站点。`Draft` 和 `Invisible` 页面不会出现在首页、文章页、搜索、归档、分类、标签和 RSS 中。

## 验收清单

1. Netlify 首次构建成功，站点可访问。
2. `/api/notion-webhook` 对 GET 返回 405，说明 Function 路由已部署。
3. Notion Webhook 显示 Verified。
4. 修改一篇已发布文章后，Netlify Deploys 中出现由 Build Hook 触发的新构建。
5. 构建结束后，线上文章内容同步更新。
