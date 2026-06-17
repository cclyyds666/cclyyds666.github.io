import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createToken, hashPassword, verifyPassword } from './auth.js';
import { createDatabase } from './db/database.js';
import { authRequired } from './middleware/authRequired.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

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

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const app = express();

  app.locals.db = db;

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
    const posts = db.prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      ORDER BY posts.created_at DESC, posts.id DESC
    `).all();

    res.json(posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      createdAt: post.created_at
    })));
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
      SELECT posts.id, posts.title, posts.content, posts.created_at, users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      createdAt: post.created_at
    });
  });

  app.get('*splat', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  return app;
}
