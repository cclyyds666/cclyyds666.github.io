# 个人网页工程说明与开发计划

## 当前功能

- 静态个人主页：展示首页 Hero、入口卡片、背景音乐、图片资源和页脚。
- 用户注册与登录：前端已调用 `/api/register` 和 `/api/login`，后端使用密码哈希保存账号。
- 个人博客/留言能力：登录后可调用 `/api/posts` 发布文章，所有访客可读取文章列表。
- PostgreSQL 数据库：Render 通过 `DATABASE_URL` 连接数据库，前端通过 Render API 获取动态内容。
- 自动化测试：使用 Vitest + Supertest 覆盖首页静态访问、注册、登录、发帖、未登录拦截。

## 目录结构

```text
render-backend/public/ 前端静态页面、样式、图片资源；Render 与 GitHub Pages 共用这一套
src/                 Node.js 后端源码
src/db/              数据库连接与建表逻辑
src/middleware/      Express 中间件
tests/               API 与前端入口测试
docs/                项目文档与开发计划
data/                本地 SQLite 数据目录，数据库文件不提交
render.yaml          Render 部署配置
```

## 本地开发

```bash
npm install
npm run dev
```

默认服务地址为 `http://localhost:3000`。

## 测试

```bash
npm test
```

## Render 部署说明

- 构建命令：`npm install`
- 启动命令：`npm start`
- Node 版本：`24`
- 建议配置环境变量：
  - `JWT_SECRET`：生产环境 Token 签名密钥。
  - `DATABASE_PATH`：SQLite 文件路径，默认 `data/site.sqlite`。

注意：Render 免费 Web Service 的文件系统可能不会长期持久化。后续如果留言/博客数据必须稳定保存，建议升级为 Render Disk 或迁移到 Render PostgreSQL。

## 下一步开发计划

1. 修复并统一页面中文编码，补齐导航中引用但仓库里尚不存在的页面。
2. 给博客增加删除、编辑、分页和 Markdown/富文本能力。
3. 给留言或文章增加前端提示状态，减少 `alert`，提升移动端表单体验。
4. 增加管理员角色，用于审核留言、管理公开内容。
5. 为数据库增加迁移脚本，并考虑从 SQLite 平滑迁移到 PostgreSQL。
6. 增加端到端测试，覆盖浏览器里的注册、登录和发布流程。
