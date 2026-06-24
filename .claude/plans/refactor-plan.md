# 前端重构 + 用户资料管理 + 音乐播放器 · 总规划

## 背景

当前个人网站前端托管于 GitHub Pages，后端 Express.js 部署在 Render，数据库已迁移至 Neon (PostgreSQL)。本次重构聚焦前端体验提升。

## 总体目标（三合一）

1. **页面结构重组** — 登录/发帖从 `index.html` 底部移到 `homee.html`，恢复首页的干净展示
2. **交互优化** — Modal 弹窗登录/注册、发帖折叠、登录态全局感知
3. **用户资料管理** — 修改昵称、上传头像
4. **音乐播放器** — 嵌入式网易云/QQ音乐外链播放器

## 文件影响矩阵

| 文件 | 创建/修改 | 涉及任务 |
|------|-----------|----------|
| `index.html` | 修改 | T1 |
| `homee.html` | 重写 | T1 |
| `board.html` | 调整 | T1 |
| `st.css` | 大幅扩充 | T1+T2+T3 |
| `public/` 下对应文件 | 同步修改 | T1 |
| `render-backend/src/db/database.js` | 修改 | T2 |
| `render-backend/src/app.js` | 新增路由 | T2 |
| `render-backend/src/auth.js` | 修改 | T2 |

## 执行顺序

T1 → T2 可并行进行；两个都完成后，写公共的 description，然后同步 public 目录。

## 注意点

- 所有页面的导航栏、页脚保持完全一致
- 公共样式在 `st.css` 中统一管理
- API 地址使用 `window.SITE_API_BASE_URL` 环境变量，fallback 到 Render 地址
- 用户头像用免费的 Gravatar + 本地 fallback 方案，不上传文件到服务器
- 音乐播放器用网易云外链 iframe，不需要后端支持
- `board.html` 中 `API_BASE_URL` 地址要更新或统一
- Render 的 `public/` 目录与根目录的页面同步修改

## 部署检查清单

- [ ] 所有页面导航栏链接正确
- [ ] st.css 中新的 Modal/UserBar/Editor 样式正常
- [ ] render-backend/public/ 下的页面同步更新
- [ ] Token 刷新后用户资料正确显示
- [ ] Neon 数据库中 users 表新增 nickname/avatar_url 字段
