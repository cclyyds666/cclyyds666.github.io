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
