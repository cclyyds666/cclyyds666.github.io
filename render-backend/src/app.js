import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createToken, hashPassword, verifyPassword } from './auth.js';
import { createDatabase } from './db/database.js';
import { authRequired } from './middleware/authRequired.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at
  };
}

function parsePagination(query) {
  const requestedLimit = Number.parseInt(query.limit, 10);
  const requestedOffset = Number.parseInt(query.offset, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  return { limit, offset };
}

function postResponse(post) {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    author: post.author,
    createdAt: post.created_at,
    updatedAt: post.updated_at
  };
}

function messageResponse(message) {
  return {
    id: message.id,
    name: message.name,
    content: message.content,
    createdAt: message.created_at
  };
}

function ownsPost(db, postId, userId) {
  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
  if (!post) return null;
  return post.user_id === userId;
}

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const app = express();

  app.locals.db = db;

  app.use((req, res, next) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const origin = req.get('origin');

    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }

    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(publicDir));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'personal-site-api' });
  });

  app.post('/api/register', (req, res) => {
    const username = cleanText(req.body?.username);
    const password = cleanText(req.body?.password);

    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ message: '用户名长度需要在 3 到 24 个字符之间。' });
    }

    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ message: '密码长度至少需要 6 个字符。' });
    }

    const { hash, salt } = hashPassword(password);

    try {
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, password_salt)
        VALUES (?, ?, ?)
      `).run(username, hash, salt);

      const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json({ message: '注册成功。', user: publicUser(user) });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({ message: '该用户名已经被注册。' });
      }
      return res.status(500).json({ message: '注册失败，请稍后重试。' });
    }
  });

  app.post('/api/login', (req, res) => {
    const username = cleanText(req.body?.username);
    const password = cleanText(req.body?.password);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ message: '用户名或密码错误。' });
    }

    return res.json({
      message: '登录成功。',
      token: createToken(user),
      user: publicUser(user)
    });
  });

  app.get('/api/posts', (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const posts = db.prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, posts.updated_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      ORDER BY posts.created_at DESC, posts.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;

    res.json({ items: posts.map(postResponse), total, limit, offset });
  });

  app.get('/api/posts/:id', (req, res) => {
    const post = db.prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, posts.updated_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `).get(req.params.id);

    if (!post) return res.status(404).json({ message: '没有找到这篇帖子。' });
    return res.json(postResponse(post));
  });

  app.post('/api/posts', authRequired, (req, res) => {
    const title = cleanText(req.body?.title);
    const content = cleanText(req.body?.content);

    if (!title || !content) {
      return res.status(400).json({ message: '标题和内容都不能为空。' });
    }

    if (title.length > 80 || content.length > 4000) {
      return res.status(400).json({ message: '标题或内容过长。' });
    }

    const result = db.prepare(`
      INSERT INTO posts (user_id, title, content)
      VALUES (?, ?, ?)
    `).run(req.user.id, title, content);

    const post = db.prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, posts.updated_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json(postResponse(post));
  });

  app.patch('/api/posts/:id', authRequired, (req, res) => {
    const postId = Number(req.params.id);
    const allowed = ownsPost(db, postId, req.user.id);
    if (allowed === null) return res.status(404).json({ message: '没有找到这篇帖子。' });
    if (!allowed) return res.status(403).json({ message: '只能修改自己发布的帖子。' });

    const title = cleanText(req.body?.title);
    const content = cleanText(req.body?.content);

    if (!title || !content) return res.status(400).json({ message: '标题和内容都不能为空。' });
    if (title.length > 80 || content.length > 4000) return res.status(400).json({ message: '标题或内容过长。' });

    db.prepare(`
      UPDATE posts
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, content, postId);

    const post = db.prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, posts.updated_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `).get(postId);

    return res.json(postResponse(post));
  });

  app.delete('/api/posts/:id', authRequired, (req, res) => {
    const postId = Number(req.params.id);
    const allowed = ownsPost(db, postId, req.user.id);
    if (allowed === null) return res.status(404).json({ message: '没有找到这篇帖子。' });
    if (!allowed) return res.status(403).json({ message: '只能删除自己发布的帖子。' });

    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    return res.status(204).end();
  });

  app.get('/api/messages', (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const messages = db.prepare(`
      SELECT id, name, content, created_at
      FROM messages
      WHERE approved = 1
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE approved = 1').get().count;

    res.json({ items: messages.map(messageResponse), total, limit, offset });
  });

  app.post('/api/messages', (req, res) => {
    const name = cleanText(req.body?.name) || '匿名朋友';
    const content = cleanText(req.body?.content);
    const website = cleanText(req.body?.website);

    if (website) return res.status(400).json({ message: '提交失败，请稍后再试。' });
    if (!content) return res.status(400).json({ message: '留言内容不能为空。' });
    if (name.length > 24 || content.length > 500) return res.status(400).json({ message: '昵称或留言内容过长。' });

    const result = db.prepare(`
      INSERT INTO messages (name, content)
      VALUES (?, ?)
    `).run(name, content);
    const message = db.prepare('SELECT id, name, content, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({ message: '留言成功。', item: messageResponse(message) });
  });

  app.delete('/api/messages/:id', authRequired, (req, res) => {
    const result = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ message: '没有找到这条留言。' });
    return res.status(204).end();
  });

  app.get('*splat', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  return app;
}
