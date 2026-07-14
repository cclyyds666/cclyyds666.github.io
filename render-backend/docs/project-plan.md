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

---

## 实施计划：保活 + 列表瘦身 + 限流 + 前端合并 + SRI（2026-07-15）

### 问题 / 目标

1. Render Free 会休眠，首请求慢 → GitHub Actions 定时 ping `/api/health`。
2. 帖子列表返回完整 base64 正文 → 首页过慢。
3. 注册/登录/留言/发帖无限流 → 易被刷。
4. `index.html` 与 `homee.html` 双份 SPA 逻辑漂移。
5. marked/DOMPurify CDN 无 SRI。

### 方案

1. 新增 `.github/workflows/keep-render-awake.yml`：每 12 分钟 curl health，允许 `workflow_dispatch`。
2. `GET /api/posts` 列表项去掉 `data:image/...` 大图或截断正文；`GET /api/posts/:id` 仍返回全文。前端列表若需全文可点开详情，或继续用列表但渲染摘要。
3. 复用现有 `enforceAiRateLimit` 思路，通用 IP 限流：register/login/messages/posts。
4. 抽 `render-backend/public/site-app.js` 承载共用 API/用户栏/发帖逻辑；`index.html` 与 `homee.html` 只保留页面结构差异（AI 区块仅 homee）。
5. CDN script 加 `integrity` + `crossorigin="anonymous"`（用已知版本哈希）；`target=_blank` 加 `rel="noopener noreferrer"`。
6. **前端冷启动提示**：共享脚本轮询 `/api/health`；未就绪时页脚/状态区显示「后端唤醒中…」，就绪后自动恢复并刷新帖子/访问数。

### 涉及文件

- `docs/project-plan.md`、`render-backend/docs/project-plan.md`
- `.github/workflows/keep-render-awake.yml`
- `render-backend/src/app.js`
- `render-backend/tests/api.test.js`
- `render-backend/public/site-app.js`（新建）
- `render-backend/public/site-visit.js`（冷启动提示）
- `render-backend/public/index.html`、`homee.html`
- 可能小改 `board.html` 等

### 验证

- `cd render-backend && npm test`
- 列表接口响应明显小于带图全文
- 限流触发返回 429
- 合并推送 main 后 Actions 出现 keep-awake workflow
- 冷启动时页脚显示唤醒提示，恢复后数字刷新

### 状态

- [x] 已实现并测试

### 结果摘要

- GitHub Actions `keep-render-awake.yml` 每 12 分钟 ping `/api/health`
- 帖子列表剥离 base64 图并截断正文；详情仍返回全文
- 注册/登录/留言/发帖 IP 限流（60s/30 次）
- 共用 `site-app.js`；index/homee 仅结构差异（AI 仅 homee）
- marked@15.0.12 + DOMPurify@3.2.6 加 SRI；Gravatar 加 rel=noopener
- 前端冷启动：轮询 health，页脚 `#backendStatus` 提示唤醒中
- 测试 18 项通过

---

## 实施计划：主页真正统一 + 列表可展开看图（2026-07-15）

### 澄清

上一轮“合并 index/homee”指的是 **共用 `site-app.js` 逻辑**，不是删掉其中一个页面。  
所以两个 HTML 内容仍不同（homee 有 AI，index 没有），容易误解。

### 问题

1. 用户期望“一个主页”，不是两套入口。
2. 列表为提速去掉 base64 图后，前端没有“展开全文”，看起来像照片丢了；照片仍在数据库/`GET /api/posts/:id`，但网页看不了。

### 方案

1. **主页统一到 `index.html`**：把 AI 区块放进 index；`homee.html` 改为跳转 `index.html`；全站导航“主页”指向 `index.html`。
2. **列表展开全文**：摘要帖显示「展开全文 / 查看图片」；点击后请求 `GET /api/posts/:id`，用完整 Markdown（含图）替换该条。
3. 摘要仍剥离大图以保速度；详情/展开才加载图片。

### 涉及文件

- `docs/project-plan.md`
- `render-backend/public/site-app.js`
- `render-backend/public/index.html`
- `render-backend/public/homee.html`
- 各页导航中的 `homee.html` 链接（可选批量改）
- `render-backend/tests/api.test.js`（如需）

### 验证

- 打开 `/` 有 AI + 帖子列表
- `homee.html` 跳到 index
- 带图帖列表显示摘要；点展开后图片可见
- `npm test`

### 状态

- [x] 已实现并测试

### 结果摘要

- `index.html` 成为唯一主页（含 AI + 帖子）
- `homee.html` 改为跳转 index，避免双主页
- 全站导航“主页”指向 index
- 列表摘要仍不带大图；点击「展开全文 / 查看图片」请求 `/api/posts/:id` 显示完整图文
- 测试 18 项通过
