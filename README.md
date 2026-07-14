# 陈同学的秘密花园

个人站点：GitHub Pages 静态前端 + Render Express API + Neon PostgreSQL。

## 目录

| 路径 | 用途 |
|---|---|
| `render-backend/` | **唯一运行时后端**（开发 / 测试 / 部署都看这里） |
| `render-backend/public/` | 前端页面与静态资源（Pages 部署源） |
| `render.yaml` | Render 服务配置 |
| `.github/workflows/pages.yml` | 推送 `render-backend/public/**` 时部署 Pages |
| `docs/project-plan.md` | 工程说明与维护记录 |
| `src/` | 已废弃的旧后端拷贝，请勿继续改 |

## 本地开发

```bash
cd render-backend
cp ../env/cclyyds666.env.example .env   # 或自行导出环境变量
npm ci
npm run dev
```

需要环境变量：

- `DATABASE_URL` — Neon / PostgreSQL
- `JWT_SECRET` — 登录 token 签名
- `ALLOWED_ORIGINS` — 如 `https://cclyyds666.github.io,http://localhost:3000`
- `AI_API_KEY` / `AI_API_BASE_URL` / `AI_MODEL` — Agnes AI（可选）
- `ADMIN_USERNAME` — 可删除留言的站长用户名（可选）

## 测试

```bash
cd render-backend && npm test
```

## 发帖带图说明

图片以 base64 嵌入 Markdown。前端会在浏览器内压缩（最长边 1280、JPEG ~0.72），
后端 `express.json` 限制 **6mb**，帖子内容上限 **2_000_000** 字符。
发布前若仍提示过长，请减少张数。
