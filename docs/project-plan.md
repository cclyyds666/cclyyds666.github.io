# 个人网页工程说明与 AI 功能实施计划

更新时间：2026-07-07

## 当前项目状态

- 技术栈：Node.js 24、ESM、Express 5、PostgreSQL（`pg`）、Vitest + Supertest。
- 项目里存在两套相近后端目录：
  - 根目录 `src/`：本地入口为 `src/server.js` / `src/app.js`。
  - `render-backend/src/`：Render 当前实际构建与启动目录，`render.yaml` 使用 `cd render-backend && npm ci`、`cd render-backend && npm start`。
- 前端静态资源：`render-backend/public/*.html`，主要页面包含 `index.html`、`homee.html`、`board.html` 等。
- 数据库：后端通过 `DATABASE_URL` 连接 PostgreSQL，并在启动时执行幂等建表/索引迁移。
- 已有功能：注册、登录、用户资料、帖子、留言、访问统计、静态展示页面。
- 自动化测试：`render-backend/tests/api.test.js` 覆盖核心 API 流程，并已有 AI 代理测试。

## 已发现需要修正/注意的点

1. **部署目标优先级**：Render 实际运行 `render-backend`，AI 功能应优先改 `render-backend/src/app.js`、`render-backend/package.json`、`render-backend/tests/api.test.js`；之后再决定是否同步根目录 `src/`，避免两套后端行为分叉。
2. **已有 AI 路由并非空白**：`render-backend/src/app.js` 已有 `GET /api/ai/config` 和 `POST /api/ai/chat`，但当前实现是 OpenAI-compatible 代理：接收前端传入 `baseUrl`、`apiKey`、`model`，再 `fetch(${baseUrl}/chat/completions)`。
3. **当前 AI UI 不适合上线**：`render-backend/public/homee.html` 要求用户填写接口地址、API Key 和模型；公开网页不应收集或传输用户/站长 API Key。
4. **安全风险**：后端接受任意 `baseUrl` 会使本站变成通用代理/SSRF 风险点；后端应固定调用 Anthropic 官方 SDK，密钥只来自服务器环境变量。
5. **测试重复**：`render-backend/tests/api.test.js` 中 AI 代理成功用例重复出现，需要在重构时顺手整理。
6. **文档历史残留**：部分描述仍可能提到 SQLite 或旧部署命令，后续改动需以当前 PostgreSQL + `render-backend` Render 配置为准。

## Anthropic Agents / Managed Agents API 调研结论

> 注：尝试在线拉取最新文档时当前环境被验证/网络限制拦截；以下基于已加载的官方 Claude API / Managed Agents 文档缓存。拿到真实 API Key 后必须执行 smoke test 验证。

### 推荐路线

当前个人网站是 Express 后端 + 静态前端，建议分两步做：

1. **MVP：Messages API 普通聊天代理**
   - 使用官方 SDK `@anthropic-ai/sdk`。
   - 重构现有 `POST /api/ai/chat`，不再接收 `baseUrl`、`apiKey`、`model`。
   - 模型默认 `claude-opus-4-8`，请求使用后端环境变量 `ANTHROPIC_API_KEY`。
   - 优点：实现快、适合网页问答、测试容易、风险低。

2. **升级版：Managed Agents**
   - 适用于长任务、工具执行、文件工作区、未来知识库/网页搜索/多轮 session 等场景。
   - 官方强制流程：先创建持久 Agent，再每次创建或复用 Session。
   - 关键点：`agents.create` 是一次性 setup，不应在用户每次聊天请求中调用。

### Managed Agents 核心接口与注意事项

- Beta header：`managed-agents-2026-04-01`（官方 SDK 的 `client.beta.*` 通常自动设置）。
- 创建 Environment：`POST /v1/environments`
  - Cloud 环境配置示例：`{ type: 'cloud', networking: { type: 'unrestricted' } }`。
  - 若限制联网，使用 limited networking 并列出允许访问的主机。
- 创建 Agent：`POST /v1/agents`
  - Agent 是持久、版本化配置。
  - `model`、`system`、`tools`、`mcp_servers` 等配置在 Agent 上，不在 Session 上。
  - 需要保存返回的 `agent.id` 和 `agent.version`。
- 创建 Session：`POST /v1/sessions`
  - 每次运行/对话创建或复用 session，引用已有 agent 和 environment。
  - 可通过 `events.send` 发送 `user.message`。
- 事件流：`GET /v1/sessions/{id}/events/stream`
  - 推荐先打开 stream 再发送消息，避免错过早期事件。
  - 客户端代码需处理 `agent.message`、`agent.custom_tool_use`、`session.status_idle`、`session.status_terminated` 等事件。
- Agents 是持久资源：创建一次、保存 ID；用户请求路径里只创建 Session 或发送 Session event。

## AI 功能目标

在个人网页中加入安全、可测试、可逐步升级的“AI 智能助手”：

- 用户在前端输入问题，后端调用 Anthropic API 返回回答。
- `ANTHROPIC_API_KEY`、Agent ID、Environment ID 等密钥/控制面 ID 全部保存在 Render 环境变量中。
- 前端只调用本站后端，不直接连接 Anthropic API。
- 初版先支持普通对话；后续再升级到 Managed Agents 的持久 Agent/Session、文件产物和长任务。

## 集成安全原则

- 不允许把 `ANTHROPIC_API_KEY` 暴露到前端。
- 不允许前端提交任意 `baseUrl`、`apiKey`、`model`。
- `/api/ai/chat` 初版建议继续要求登录：复用 `authRequired`。
- 对 prompt 做长度限制，例如 2,000～4,000 字符。
- 对返回内容只用 `textContent` 渲染；如果未来要 Markdown 渲染，必须先 sanitize。
- 错误处理要区分未配置、鉴权失败、限流、上游不可用；不要把内部错误、Key、完整请求体返回给前端。
- 如需限流，优先按登录用户 ID + IP 做简单窗口限制，避免被刷爆 API 额度。

## 建议新增/调整的环境变量

Render 服务 `render-backend` 建议新增：

- `ANTHROPIC_API_KEY`：服务端 Anthropic 凭据。
- `AI_MODEL=claude-opus-4-8`：默认模型。
- `AI_SYSTEM_PROMPT`：可选，定义个人网页助手角色。
- `AI_PROMPT_MAX_CHARS=4000`：可选，prompt 最大长度。
- 后续 Managed Agents：
  - `ANTHROPIC_AGENT_ID`
  - `ANTHROPIC_AGENT_VERSION`
  - `ANTHROPIC_ENVIRONMENT_ID`

## 实施计划

### 阶段 0：确认范围与 API 可用性

- [ ] 明确本次代码实现范围：优先改 `render-backend`；如果根目录 `src/` 仍用于本地/其他部署，则同步对应改动。
- [ ] 用户提供 Anthropic API Key 或在 Render/本地设置 `ANTHROPIC_API_KEY`。
- [ ] 在本地或 Render 环境执行最小 smoke test：
  - SDK 能初始化。
  - `claude-opus-4-8` 可调用。
  - 返回文本可解析。
  - 401/403/429/5xx 能被清晰处理。

### 阶段 1：重构 MVP 后端聊天代理

- [ ] 在 `render-backend/package.json` 安装依赖：`@anthropic-ai/sdk`。
- [ ] 在 `render-backend/src/app.js` 重构现有 `POST /api/ai/chat`：
  - 保留 `authRequired`。
  - 请求体改为：`{ prompt: string }`。
  - 返回体保持：`{ answer: string }`，减少前端改动。
  - 删除/忽略前端传入的 `baseUrl`、`apiKey`、`model`。
  - 删除 `cleanBaseUrl`、`DEFAULT_AI_API_BASE_URL` 等 OpenAI-compatible 代理逻辑，或改为不再暴露给浏览器。
- [ ] 使用官方 SDK `@anthropic-ai/sdk`，不要用 `fetch`/raw HTTP 调 Anthropic。
- [ ] 调用建议：
  - `model: process.env.AI_MODEL || 'claude-opus-4-8'`
  - `max_tokens` 初版 1024～2048。
  - `thinking: { type: 'adaptive' }` 可用于复杂问题；简单网页问答可先不暴露给用户。
  - `system` 使用 `AI_SYSTEM_PROMPT` 或内置默认站点助手提示。
- [ ] 服务端校验：
  - prompt 必填。
  - prompt 长度限制。
  - 请求 JSON 大小继续受 `express.json({ limit: '1mb' })` 限制。
- [ ] 错误处理：
  - 未配置 `ANTHROPIC_API_KEY` 返回 503。
  - Anthropic 鉴权失败返回通用中文提示，不泄露细节。
  - 429 返回“请求过于频繁，请稍后再试”。
  - 5xx/网络错误返回“AI 服务暂时不可用”。
- [ ] 视情况调整 `GET /api/ai/config`：
  - 不再返回 `baseUrl`。
  - 可只返回 `{ enabled: Boolean(process.env.ANTHROPIC_API_KEY), model: publicModelName }`，或直接删除前端依赖。

### 阶段 2：前端 UI 修正

- [ ] 修改 `render-backend/public/homee.html` 的 AI 区块：
  - 删除“AI 接口地址”“API Key”“模型名称”输入框。
  - 保留 prompt textarea、发送按钮、状态、回答展示。
  - 若未登录，提示“请先登录后使用 AI 助手”。
- [ ] 修改 `handleAiChat()`：
  - 只提交 `{ prompt }`。
  - 继续带 `Authorization: Bearer ${currentToken}`。
  - 不再读取或保存任何 API Key。
- [ ] 回答展示继续使用 `textContent`，暂不渲染 Markdown。
- [ ] 补充加载态和错误态，避免重复点击。

### 阶段 3：测试

- [ ] 更新 `render-backend/tests/api.test.js`：
  - 删除重复的 AI 代理成功用例。
  - 将旧的 `global.fetch` mock 改为 Anthropic SDK mock，或把 Anthropic 调用封装成可注入 helper 方便测试。
  - 覆盖未登录被拒绝。
  - 覆盖 prompt 为空返回 400。
  - 覆盖 prompt 过长返回 400。
  - 覆盖未配置 `ANTHROPIC_API_KEY` 返回 503。
  - 覆盖 SDK 成功返回 `{ answer }`。
  - 覆盖 rate limit / API error 返回安全错误信息。
- [ ] 在 `render-backend` 下运行 `npm test`。
- [ ] 本地启动 `npm run dev`，浏览器手动验证登录后 AI 问答流程。
- [ ] 部署 Render 后验证 GitHub Pages 前端能通过 CORS 访问后端。

### 阶段 4：Managed Agents 升级（可选增强）

当普通聊天可用后，再切换/扩展为 Managed Agents：

- [ ] 一次性 setup 脚本或 Anthropic CLI：创建 Environment。
- [ ] 一次性 setup 脚本或 Anthropic CLI：创建 Agent，系统提示设为“个人网页助手，熟悉站点内容、留言和博客写作”。
- [ ] 保存 `agent_id`、`agent_version`、`environment_id` 到 Render 环境变量。
- [ ] 后端新增 `/api/ai/session`：创建 Session 并返回 `sessionId`。
- [ ] 后端新增 `/api/ai/session/:id/message`：向 session 发送 `user.message` 并读取事件流/轮询结果。
- [ ] 前端若要实时显示，增加 SSE 或轮询；若只是 MVP，可后端聚合最终回答后返回。
- [ ] 若需要长文本/文件产出，再加入 session output 文件读取。
- [ ] 注意不要在每次用户提问时创建新的 Agent，只创建/复用 Session。

## 可交给子 Agent 的任务拆解

### 子 Agent A：前端 AI UI 审核

- 读取 `render-backend/public/homee.html`、`index.html`、`st.css`。
- 确认现有 AI 区块的 DOM、样式和脚本依赖。
- 输出最小前端改动点：删除哪些输入、保留哪些 ID、是否需要补样式。

### 子 Agent B：后端 API 重构

- 读取 `render-backend/src/app.js`、`render-backend/src/middleware/authRequired.js`、`render-backend/tests/api.test.js`。
- 重构现有 `POST /api/ai/chat`。
- 使用官方 `@anthropic-ai/sdk`，不要用 OpenAI-compatible `fetch` 代理。
- 密钥只能来自环境变量。
- 添加/更新测试覆盖成功、未登录、空 prompt、过长 prompt、未配置 Key、上游错误。

### 子 Agent C：接口文档与 smoke test

- 在拿到 API Key 后执行真实 smoke test。
- 验证 Node 24 + ESM 下 SDK 初始化、模型名、返回内容字段。
- 如未来启用 Managed Agents，验证 `environments.create -> agents.create -> sessions.create -> events.send/stream` 的最小流程。
- 记录需要的 Render 环境变量和失败排查方法。

### 子 Agent D：部署与安全复核

- 检查 `render.yaml` 与实际 package 结构是否一致。
- 检查 `ALLOWED_ORIGINS`、登录鉴权、错误信息、prompt 长度、频率限制。
- 确认前端不再收集或存储 API Key。
- 部署前在 `render-backend` 下跑 `npm test`，部署后验证 `/api/health` 和 `/api/ai/chat`。

## 验收标准

- [ ] 用户登录后能在网页 AI 助手输入问题并收到回答。
- [ ] 浏览器网络请求中不包含 Anthropic API Key、任意 AI base URL 或模型配置。
- [ ] 未登录用户不能调用 AI 接口（若采用登录限制）。
- [ ] 空 prompt、过长 prompt、上游 API 错误都有清晰中文提示。
- [ ] `render-backend` 下 `npm test` 全部通过。
- [ ] Render 环境变量配置完成后，GitHub Pages 线上页面可正常调用后端。
