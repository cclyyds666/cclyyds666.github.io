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
| `st.css` | 大幅扩充 | T1 |
| `public/` 下对应文件 | 同步修改 | T1 |
| `render-backend/src/db/database.js` | 修改 | T2 |
| `render-backend/src/app.js` | 新增路由 | T2 |
| `render-backend/src/auth.js` | 轻微修改 | T2 |

## 执行顺序

T1 和 T2 可并行进行。两个都完成后，再验证联调。

## 需要注意的点

- 所有页面的导航栏、页脚必须保持完全一致（目前所有页面导航已标准化）
- 公共样式在 `st.css` 中统一管理，不创建新 CSS 文件
- API 地址使用 `window.SITE_API_BASE_URL` 环境变量，fallback 到 Render 地址
- 用户头像采用 Gravatar + 本地首字母 fallback，不上传文件到服务器
- 音乐播放器用网易云外链 iframe，不需要后端支持
- 修改 `render-backend/public/` 下的页面需要同步到 `public/` 和根目录
- board.html 和 index.html 中的 `API_BASE_URL` 地址应当统一为 `window.SITE_API_BASE_URL` 模式
- 登录成功后 Token 存入 `localStorage`，页面刷新后自动恢复登录态

## 部署检查清单

- [ ] 所有页面导航栏链接正确
- [ ] `st.css` 中新的 Modal / UserBar / Editor 样式正常
- [ ] `render-backend/public/` 下的页面同步更新
- [ ] Token 刷新后用户资料正确显示
- [ ] Neon 数据库中 `users` 表新增 `nickname` / `avatar_url` 字段
- [ ] 新用户注册自动获得 NULL 昵称，前端正常降级显示用户名
