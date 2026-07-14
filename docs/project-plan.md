# 个人网页工程说明

更新时间：2026-07-15

## 当前项目状态

- 技术栈：Node.js 24、ESM、Express 5、PostgreSQL（`pg` / Neon）、Vitest + Supertest。
- **唯一后端**：`render-backend/`。根目录 `src/` 已废弃，仅作兼容提示。
- 前端静态资源：`render-backend/public/*.html`（Pages 与 Render 同源目录）。
- 已有功能：注册/登录、资料、帖子（Markdown + 压缩 base64 图）、留言、访问统计、Agnes AI 助手、今日签。

## 部署

- Render：`render.yaml` → `cd render-backend && npm ci` / `npm start`，health：`/api/health`。
- GitHub Pages：`.github/workflows/pages.yml` 上传 `render-backend/public`。
- CORS：`ALLOWED_ORIGINS=https://cclyyds666.github.io`。

## AI（Agnes）

- 后端固定代理：`AI_API_KEY` + `AI_API_BASE_URL` + `AI_MODEL`（默认 `agnes-1.5-flash`）。
- 前端只提交 `{ prompt }`，不收集用户 Key。
- `/api/ai/chat` 需登录；有 prompt 长度上限与简易按用户限流。
- `/api/ai/config` 仅返回 `enabled` / `model`，不暴露 baseUrl。
- `/api/ai/daily-quote` 公开，按自然日内存缓存。

## 发帖带图（2026-07-15 修复）

根因：手机原图转 base64 后远超旧限制（content 50 万字 + `express.json` 1mb），后端返回「标题或内容过长」。

已调整：

1. `express.json` → **6mb**
2. POST/PATCH 帖子 content 上限统一 → **2_000_000**
3. 前端 canvas 压缩：最长边 1280，JPEG 质量约 0.72，单张过大再降质
4. 更明确的过长错误文案

## 安全维护（2026-07-15）

- `.gitignore` 忽略 `env/`、`*.env`
- 帖子 Markdown 经 DOMPurify 再 `innerHTML`
- 删除留言仅 `ADMIN_USERNAME` 对应用户
- AI 上游错误不直出内部信息

## 建议环境变量

| Key | 说明 |
|---|---|
| `DATABASE_URL` | Neon 连接串 |
| `JWT_SECRET` | 必填生产环境 |
| `ALLOWED_ORIGINS` | 逗号分隔前端源 |
| `AI_API_KEY` / `AI_API_BASE_URL` / `AI_MODEL` | Agnes |
| `AI_PROMPT_MAX_CHARS` | 默认 4000 |
| `ADMIN_USERNAME` | 站长用户名（删留言） |

## 维护注意

1. 只改 `render-backend/`，不要在根 `src/` 加功能。
2. 大图仍走 base64 入库，库体积会涨；长期可改对象存储。
3. Render free 会冷启动，前端需容忍首请求慢。
4. **每次代码编辑前**，先把计划写入本文件（`docs/project-plan.md`），再动手改代码。此规则已写入 `CLAUDE.md`。

---

## 实施计划：访问计数 + 维护优化（2026-07-15）

### 问题

1. 页脚「本站累计访问」不刷新当前访问：先 `loadVisitCount()` 再 `sendBeacon`，beacon 不可 await，页面不二次拉总数。
2. `sendBeacon(url, JSON.stringify(...))` 发成 `text/plain`，Express 解析不到 body，path 恒为 `/`。
3. 用户栏 `innerHTML` 拼接 nickname/username/avatarUrl → XSS。
4. DOMPurify CDN 失败时 Markdown fail-open。
5. `requestJson` 给 GET 也带 `Content-Type: application/json`，多余 preflight。
6. `/api/ai/daily-quote` 无速率限制，可刷 AI 额度。

### 方案

1. 新增共享脚本 `render-backend/public/site-visit.js`：await POST `/api/visit`（JSON）→ 再 GET count 更新 `#visitCount`。
2. 九个页面去掉内联 visit 逻辑，改为 `<script src="site-visit.js">`。
3. 后端：`text/plain` 兼容解析 visit body；visit/count 失败返回非 2xx；daily-quote 简易 IP 限流；`trust proxy` 便于真实 IP。
4. `index.html` / `homee.html`：用户栏 DOM 安全构建；`renderMarkdown` 无 DOMPurify 时 textContent 回退；`requestJson` 仅有 body 时设 Content-Type。
5. 测试：visit 写入/计数、text/plain 兼容、daily-quote 不无限调用（如可 mock）。

### 涉及文件

- `CLAUDE.md`
- `docs/project-plan.md`、`render-backend/docs/project-plan.md`
- `render-backend/public/site-visit.js`（新建）
- `render-backend/public/*.html`（九页）
- `render-backend/src/app.js`
- `render-backend/tests/api.test.js`

### 验证

- `cd render-backend && npm test`
- 浏览器打开页面：访问数应在记录后递增；刷新再增 1
- 合并推送 main 触发 Pages + Render

### 状态

- [x] 已实现并测试

### 结果摘要

- 共享 `site-visit.js`：先 POST 再 GET，页脚显示当前累计
- 后端兼容 text/plain visit body；失败返回 503
- 用户栏 DOM 安全构建；DOMPurify 缺失 fail-closed
- 用户名禁 `<>"'` 等；头像仅 http(s)
- daily-quote 按 IP 限流；trust proxy 开启
- 测试 17 项（含 visit / text-plain / unsafe username）
