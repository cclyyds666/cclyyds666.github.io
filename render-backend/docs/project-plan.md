# 陈同学的秘密花园 — 项目文档

> 生成日期：2026-06-23
> 最后更新：2026-06-27

> **注意**：此为精简版，完整文档请参见 `docs/project-plan.md`。

---

## 当前功能

- 静态个人主页：展示首页 Hero、入口卡片、背景音乐、图片资源和页脚。
- 用户注册与登录：前端已调用 `/api/register` 和 `/api/login`，后端使用密码哈希保存账号。
- 个人博客/留言能力：登录后可调用 `/api/posts` 发布文章，所有访客可读取文章列表。
- PostgreSQL 数据库：Render 通过 `DATABASE_URL` 连接数据库，前端通过 Render API 获取动态内容。
- 自动化测试：使用 Vitest + Supertest 覆盖首页静态访问、注册、登录、发帖、未登录拦截。

## 目录结构

```text
render-backend/
├── src/                 Node.js 后端源码
├── public/              前端静态页面、样式、图片资源；Render 与 GitHub Pages 共用这一套
├── tests/               API 测试
├── docs/                项目文档（本文档）
├── render.yaml          Render 部署配置
└── package.json         npm 配置
```

## 本地开发

```bash
npm install
npm start
```

默认服务地址为 `http://localhost:3000`。

## 测试

```bash
npm test
```

## Render 部署说明

- 构建命令：`cd render-backend && npm ci`
- 启动命令：`cd render-backend && npm start`
- Node 版本：`24`
- 建议配置环境变量：
  - `JWT_SECRET`：生产环境 Token 签名密钥。
  - `DATABASE_URL`：Neon PostgreSQL 连接字符串。

## 下一步开发计划

1. 博客增加删除/编辑/分页能力
2. 前端状态提示优化（减少 alert）
3. 增加管理员角色，用于留言审核
4. 端到端测试（E2E）
5. AI 智能助手接口优化
