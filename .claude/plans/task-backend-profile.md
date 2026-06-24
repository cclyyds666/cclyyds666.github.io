# T2: 后端 — 用户资料管理 API

## 依赖

无，基于现有 Neon PostgreSQL + Express 架构扩展。

## 变更清单

### 2.1 database.js — users 表新增字段

建表迁移中为 `users` 表增加两个可选字段：

```sql
-- 在 CREATE TABLE IF NOT EXISTS users 的 created_at 行后追加：
nickname TEXT DEFAULT NULL,
avatar_url TEXT DEFAULT NULL,
```

注意：已有表需要用 ALTER TABLE 做迁移（容错处理重复列）。

```sql
-- 新加的迁移（在 migrate() 的 COMMIT 前执行）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='nickname') THEN
    ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL;
  END IF;
END;
$$;
```

### 2.2 app.js — 新增 API 路由

#### GET /api/user/profile（需认证）

返回当前用户完整资料：
```json
{
  "id": 1,
  "username": "cclyyds666",
  "nickname": "陈同学",
  "avatarUrl": "https://xxx.gravatar.com/...",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

#### PATCH /api/user/profile（需认证）

修改昵称和头像 URL：
```
请求: { "nickname": "新昵称", "avatarUrl": "https://..." }
限制: nickname 1~24字符, avatarUrl ≤512字符
返回: 更新后的完整用户资料
```

#### GET /api/users/:id/profile（公开，无需登录）

查看公开用户资料（只返回 username、nickname、avatarUrl、createdAt，不暴露密码）。

### 2.3 auth.js — Token 内容扩展

`createToken` 的 payload 中增加 `nickname` 字段，以便前端不额外请求就能显示昵称。

同时在 `publicUser` 函数中增加 `nickname` 和 `avatarUrl` 字段。

### 2.4 app.js — 登录返回值扩展

`POST /api/login` 登录成功后，返回的 user 对象应包含：
```json
{
  "id": 1,
  "username": "cclyyds666",
  "nickname": "陈同学",
  "avatarUrl": "https://xxx.gravatar.com/...",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

## 验收标准

- [ ] 数据库迁移不破坏已有表和已有数据
- [ ]  GET /api/user/profile 返回正确用户资料
- [ ]  PATCH /api/user/profile 成功修改昵称
- [ ]  PATCH /api/user/profile 超长昵称返回 400
- [ ]  GET /api/users/:id/profile 公开可用
- [ ]  Token 中包含 nickname
- [ ]  旧用户（NULL 值）前端降级显示用户名
