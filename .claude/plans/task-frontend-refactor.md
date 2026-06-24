# T1: 前端页面重构 + 音乐播放器

## 依赖

- 后端 T2 完成后联调（但前端结构可独立完成）

## 变更清单

### 1.1 index.html（首页 — 简化）

改动：
- 保留 Hero、3 个 Feature Card、页脚
- **移除** `#blog-section` 整个区块（登录/注册/帖子列表）
- **替换** `#music-section` 的音乐占位为网易云外链 iframe

网易云外链格式（占位，需要你提供歌曲ID）：
```html
<iframe
  frameborder="0"
  src="https://music.163.com/outchain/player?type=2&id=【歌曲ID】&auto=0&height=66"
  style="width:100%;height:66px;border-radius:12px;">
</iframe>
```
用 `【网易云音乐ID】` 作为占位符，后续替换。

### 1.2 homee.html（主页 — 重写为博客主页）

这是本次重构的核心页面。结构：

```
Hero（保留现有导航和标题）
main
  └── UserBar（登录状态栏，未登录显示登录按钮）
  └── PostList（帖子列表区域）
  └── AuthModal（隐藏，点击登录/注册出现）
  └── EditorModal（隐藏，登录后点击"发帖"出现）
footer
```

#### 功能流程

**未登录状态：**
- UserBar 显示 "登录 / 注册" 按钮
- PostList 显示所有已发布的帖子（可读）
- 点击按钮 → 弹出 AuthModal（登录/注册切换）
- 登录成功后 → UserBar 变为用户信息 + "发帖" + "退出"

**登录后状态：**
- UserBar 显示头像、昵称、"发帖"按钮、"退出"按钮
- 点击"发帖" → 弹出 EditorModal
- 提交后帖子刷新到列表顶部

### 1.3 st.css（样式扩充）

新增样式类：

| 类名 | 用途 |
|------|------|
| `.modal-overlay` | 弹窗遮罩层 |
| `.modal-content` | 弹窗内容卡片 |
| `.user-bar` | 顶部用户状态栏 |
| `.user-avatar` | 圆形头像 |
| `.user-info` | 用户名+昵称 |
| `.editor-collapsed` | 发帖折叠态 |
| `.auth-tabs` | 登录/注册切换标签 |
| `.music-embed` | 音乐播放器容器 |
| `.btn-ghost-sm` | 小号幽灵按钮 |

不要修改已有的类名（`.site-hero`, `.hero-content`, `.feature-card` 等）。

### 1.4 board.html（留言板）

- 保留现有功能，仅将内联 `<script>` 提取到页尾（已经在页尾）
- 更新 API_BASE_URL 为统一的新地址
- 留言列表增加加载状态提示

### 1.5 同步到 public/

修改根目录的 `index.html`、`homee.html`、`board.html` 后，同步复制到：
- `render-backend/public/`
- `public/`

## 具体样式参考（st.css 追加内容）

```css
/* ===== T1 新增样式 ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
}
.modal-content {
  width: min(440px, calc(100% - 32px));
  max-height: 80vh;
  overflow-y: auto;
  padding: 32px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper-strong);
  box-shadow: var(--shadow);
}
.modal-content h2 { margin-bottom: 18px; }
.close-modal {
  float: right;
  min-height: 36px;
  padding: 4px 14px;
  color: var(--muted);
  background: transparent;
}
.close-modal:hover { color: var(--ink); }

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.auth-tab {
  flex: 1;
  padding: 10px;
  border: 0;
  border-radius: 0;
  color: var(--muted);
  background: transparent;
  font-weight: 700;
  cursor: pointer;
}
.auth-tab.active {
  color: #fff;
  background: var(--teal);
}

.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  backdrop-filter: blur(14px);
}
.user-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--teal);
}
.user-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 900;
  font-size: 18px;
}
.user-info {
  display: flex;
  flex-direction: column;
}
.user-name {
  font-weight: 700;
  font-size: 16px;
}
.user-nickname {
  color: var(--muted);
  font-size: 13px;
}
.user-bar-right {
  display: flex;
  gap: 8px;
}

.btn-ghost-sm {
  min-height: 36px;
  padding: 6px 14px;
  color: var(--teal-dark);
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 999px;
  background: rgba(255,255,255,0.72);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s;
}
.btn-ghost-sm:hover { transform: translateY(-1px); }

.music-embed {
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.5);
}

.hidden { display: none !important; }
```

## 验收标准

- [ ] 首页清爽无登录表单、有音乐播放器 iframe
- [ ] homee.html 打开默认显示帖子列表
- [ ] 点击"登录"弹出 Modal，登录/注册切换正常
- [ ] 登录后 Modal 关闭，UserBar 显示用户信息
- [ ] 点击"发帖"弹出编辑器，提交后帖子出现在列表顶部
- [ ] 退出后 UserBar 恢复未登录状态
- [ ] 所有页面导航栏一致、页脚一致
- [ ] board.html 留言功能正常
- [ ] render-backend/public/ 已同步
