# 陈同学的秘密花园 — 项目文档

> 生成日期：2026-06-23
> 最后更新：2026-06-27

---

## 一、项目简介

个人网站项目，包含静态前端页面和 Node.js 后端 API。前端部署在 GitHub Pages，后端部署在 Render，数据库使用 Neon PostgreSQL。

### 部署信息

| 层     | 平台         | 地址                                                       |
| ------ | ------------ | ---------------------------------------------------------- |
| 前端   | GitHub Pages | `https://cclyyds666.github.io`                            |
| 后端   | Render       | `https://cclyyds666-personal-site-h8kk.onrender.com`      |
| 数据库 | Neon         | PostgreSQL（通过 `DATABASE_URL` 连接）                     |

### 用户权限

| 状态   | 可用功能                                                   |
| ------ | ---------------------------------------------------------- |
| 游客   | 浏览全站、在留言板匿名留言（Honeypot 反垃圾）               |
| 已登录 | 发布/修改/删除帖子、修改个人资料（昵称/头像）、删除留言     |

---

## 二、架构与目录结构

```
cclyyds666.github.io/
├── render-backend/            后端源码 + 前端静态页面（Render 与 Pages 共用这一套）
│   ├── src/
│   │   ├── server.js          入口，启动迁移 + 监听端口
│   │   ├── app.js             路由（API + 静态文件服务）
│   │   ├── auth.js            JWT + 密码哈希（scrypt）
│   │   ├── db/
│   │   │   └── database.js    Neon PostgreSQL 连接池 + 幂等迁移
│   │   └── middleware/
│   │       └── authRequired.js  Bearer Token 验证中间件
│   ├── public/                前端静态页面、样式、图片（GitHub Pages 发布源）
│   │   ├── index.html         主页（登录/注册/发帖/AI 助手）
│   │   ├── homee.html         次级主页（登录/注册/发帖/留言/音乐）
│   │   ├── self.html          关于我
│   │   ├── view.html          诗与远方
│   │   ├── zzu.html           我与 ZZU
│   │   ├── love.html          这就是爱
│   │   ├── memory.html        回忆录
│   │   ├── board.html         留言树洞
│   │   ├── last.html          写在最后
│   │   ├── st.css             全局样式（暗色模式、音乐播放器、图片预览等）
│   │   └── image/             图片资源
│   ├── tests/
│   │   └── api.test.js        后端 API 测试（内存数据库）
│   ├── docs/
│   │   └── project-plan.md    本文档
│   ├── package.json
│   ├── render.yaml            Render 部署配置
│   └── .node-version          Node >=24
├── src/                       根目录后端（指向 render-backend/public，兼容 Render 构建）
│   ├── server.js
│   ├── app.js                 重定向读取 render-backend/public
│   └── ...
├── .github/
│   └── workflows/
│       └── pages.yml          GitHub Pages 自动部署 workflow
├── docs/
│   └── project-plan.md        本文档
├── render.yaml                Render 根级部署配置
├── package.json
├── .gitignore
└── .node-version
```

> **注意**：`src/` 为旧版后端代码，仅供本地开发参考，不参与生产部署。生产环境统一使用 `render-backend/`。

---

## 三、后端 API 一览

所有 API 均挂载在 `render-backend/src/app.js`。

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | `{ ok: true, service: 'personal-site-api', db: 'connected' }` |

### 用户认证

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/register` | 否 | 注册（username 3-24 字符，password 6-128 字符） |
| POST | `/api/login` | 否 | 登录，返回 JWT Token（7 天有效） |

### 用户资料

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/user/profile` | 是 | 获取当前用户资料 |
| PATCH | `/api/user/profile` | 是 | 修改昵称/头像 |
| GET | `/api/users/:id/profile` | 否 | 查看公开用户资料 |

### 帖子

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/posts` | 否 | 帖子列表（分页：limit=20, max=50） |
| GET | `/api/posts/:id` | 否 | 单篇帖子详情 |
| POST | `/api/posts` | 是 | 创建帖子（title ≤ 80, content ≤ 500000） |
| PATCH | `/api/posts/:id` | 是 | 修改自己的帖子 |
| DELETE | `/api/posts/:id` | 是 | 删除自己的帖子 |

### 留言板

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/messages` | 否 | 留言列表（仅已审核的） |
| POST | `/api/messages` | 否 | 提交留言（含 Honeypot 反垃圾） |
| DELETE | `/api/messages/:id` | 是 | 删除留言 |

### 访问统计

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/visit` | 否 | 记录访问（IP hash + path） |
| GET | `/api/visits/count` | 否 | 返回总访问次数 |

---

## 四、数据库设计

生产环境使用 Neon PostgreSQL，测试使用内存数据库。

### users

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### posts

```sql
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC, id DESC);
CREATE INDEX idx_posts_user_id ON posts(user_id);
```

### messages

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_approved_created_at ON messages(approved, created_at DESC, id DESC);
```

### visits

```sql
CREATE TABLE visits (
  id SERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_visits_visited_at ON visits(visited_at DESC);
```

---

## 五、安全措施

| 措施 | 实现位置 | 说明 |
|------|----------|------|
| 密码哈希 | `auth.js` | scrypt 同步 + 随机 16 字节 salt |
| 密码比对 | `auth.js` | `crypto.timingSafeEqual` 防时序攻击 |
| JWT | `auth.js` | HMAC-SHA256，7 天过期，`JWT_SECRET` 环境变量 |
| Token 验证 | `authRequired.js` | Bearer scheme 解析 + 签名验证 + 过期检查 |
| CORS | `app.js` | 白名单模式，仅 `ALLOWED_ORIGINS` 中的域名 |
| 反垃圾 | `board.html` | Honeypot 隐藏字段（`website` 字段填值即拒绝） |
| 输入校验 | 各路由 | 长度限制 + trim 清理 |
| 请求体限制 | 全局 | `express.json({ limit: '1mb' })` |
| SQL 注入 | 全部 | 参数化查询（`$1` 占位符） |

---

## 六、本地开发

### 前置要求

- Node.js >= 24

### 启动后端（PostgreSQL 版）

```bash
cd cclyyds666.github.io/render-backend
npm install
# 设置 DATABASE_URL 环境变量后
npm start
```

### 运行测试

```bash
cd render-backend
npm test
```

测试覆盖：首页静态访问、健康检查、注册/登录/发帖全流程、未登录拦截、帖子修改/删除权限隔离、留言创建/列表/校验/删除。

---

## 七、部署指南

### 前端 → GitHub Pages

GitHub Actions workflow（`.github/workflows/pages.yml`）在 `main` 分支推送时自动将 `render-backend/public/` 发布到 GitHub Pages。

触发条件：`render-backend/public/**` 或 workflow 文件本身有变更。

### 后端 → Render

```yaml
# render.yaml
services:
  - type: web
    name: cclyyds666-personal-site
    runtime: node
    plan: free
    buildCommand: cd render-backend && npm ci
    startCommand: cd render-backend && npm start
    healthCheckPath: /api/health
    autoDeployTrigger: commit
```

### 环境变量（Render Dashboard）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串（手动配置） |
| `JWT_SECRET` | Token 签名密钥（自动生成） |
| `ALLOWED_ORIGINS` | `https://cclyyds666.github.io` |
| `NODE_VERSION` | `24.15.0` |

### 数据库 → Neon

1. 在 [Neon](https://neon.tech) 创建项目
2. 获取 `DATABASE_URL` 连接字符串
3. 在 Render Dashboard 设置 `DATABASE_URL`
4. 启动时自动执行建表迁移（幂等）

---

## 八、前后端联调

前端通过 `window.SITE_API_BASE_URL` 指定后端地址：

```javascript
const API_BASE_URL = window.SITE_API_BASE_URL || 'https://cclyyds666-personal-site-h8kk.onrender.com';
```

本地联调时设置 `window.SITE_API_BASE_URL = 'http://localhost:3000'`。

### requestJson 注意事项

```javascript
// 正确：先构造 headers，再用 restOptions 展开
const { headers: optHeaders, ...restOptions } = options;
const headers = { 'Content-Type': 'application/json', ...optHeaders };
const res = await fetch(apiUrl(path), { headers, ...restOptions });
```

不能用 `{ headers: { ... }, ...options }`，否则 `options.headers` 会覆盖 `Content-Type`。

---

## 九、依赖栈

| 技术 | 用途 |
|------|------|
| Express 5 | 后端 Web 框架 |
| pg | PostgreSQL 驱动（Neon 连接） |
| node:crypto | 密码学操作（JWT + scrypt） |
| Vitest | 测试框架 |
| Supertest | HTTP 断言测试 |
| marked.js | 前端 Markdown 渲染 |
| Node.js 24 | 运行时 |

---

## 十、工作记录

### 2026-06-27

- **统一 GitHub Pages 与 Render 前端源**：删除根目录和 `public/` 旧副本，Pages workflow 改为发布 `render-backend/public/`
- **修复 Render 首页 404**：根目录 `src/app.js` 静态目录改为指向 `render-backend/public`
- **新增 Pages 自动部署 workflow**：`.github/workflows/pages.yml`
- **清理仓库冗余文件**：移除根目录旧静态页、旧 `public/` 副本、误跟踪的 `.claude/` 目录
- **修复测试**：注入内存数据库到测试文件，页面断言对齐当前结构，9/9 通过
- **更新项目文档**：数据库描述从 SQLite 更正为 PostgreSQL/Neon
- **音乐入口优化**：
  - 添加显式"音乐"按钮（原来 hidden 无入口）
  - 改为独立窗口播放，页面切换不再重启音乐
  - 歌单 ID 基于日期种子从歌单池随机选取，每天自动换歌单
- **统一子目录文档**：合并 6 个散落的 md 文档为本文档

### 2026-06-24

- **修复 Render 构建路径**：`buildCommand`/`startCommand` 使用 `cd render-backend && ...`
- **修复信号处理器作用域**：`server.js` 中 `app` 提升到模块级 `appInstance`
- **增强健康检查**：`/api/health` 增加 `pool.query('SELECT 1')` 验证数据库连通性
- **修复前端 requestJson headers 覆盖 bug**：POST 请求体无法解析的根因
- **新增功能**：
  - 帖子 Markdown + base64 图片（最多 5 张，每张 ≤ 2MB）
  - 站点访问量统计（`visits` 表 + sendBeacon 上报）
  - 暗色模式（CSS 变量 + localStorage + 切换按钮）
  - 网易云音乐浮动播放器

---

## 十一、历史问题修复

### 问题 1：Neon 数据库用户数据定时重置

- **现象**：数据定时消失
- **根因**：Render `rootDir` 未生效，从根目录构建导致环境变量未正确传递
- **修复**：`buildCommand` 和 `startCommand` 显式 `cd render-backend && npm ...`

### 问题 2：发帖显示"标题和内容不能为空"

- **现象**：填写内容后发帖仍提示空
- **根因**：`fetch({ headers, ...options })` 中 `options.headers` 覆盖了 `Content-Type`
- **修复**：先解构 `options.headers` 合并，再用 `...restOptions` 展开

### 问题 3：Render 首页 404

- **现象**：API 正常但访问根路径返回 Not Found
- **根因**：删除旧静态副本后，Render 根目录服务找不到 `public/index.html`
- **修复**：根目录 `src/app.js` 的 `publicDir` 改为 `render-backend/public`

---

## 十二、项目发展路线

1. 博客增加删除/编辑/分页能力
2. 前端状态提示优化（减少 alert）
3. 增加管理员角色，用于留言审核
4. 端到端测试（E2E）
5. AI 智能助手接口优化
