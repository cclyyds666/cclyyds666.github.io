import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { createToken, hashPassword, verifyPassword } from './auth.js';
import { createDatabase } from './db/database.js';
import { authRequired } from './middleware/authRequired.js';

const DEFAULT_AI_API_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_AI_MODEL = 'agnes-1.5-flash';
const FALLBACK_DAILY_QUOTE = '愿你今天也能把普通日子，过成一首温柔的小诗。';
let dailyQuoteCache = { date: '', quote: '' };

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
    nickname: row.nickname || null,
    avatarUrl: row.avatar_url || null,
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

function cleanBaseUrl(value) {
  const input = cleanText(value);
  if (!input) return '';
  try {
    return new URL(input).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function currentChinaTimeContext() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return `当前中国标准时间（UTC+8，Asia/Shanghai）是：${formatter.format(now)}。如果用户询问当前时间、日期或星期，请以这个时间为准。你不能实时联网查询天气；如果用户询问天气，请说明需要接入天气接口才能获取实时天气。`;
}

async function requestAiCompletion(messages) {
  const baseUrl = cleanBaseUrl(process.env.AI_API_BASE_URL || DEFAULT_AI_API_BASE_URL);
  const apiKey = cleanText(process.env.AI_API_KEY);
  const model = cleanText(process.env.AI_MODEL) || DEFAULT_AI_MODEL;

  if (!apiKey) {
    const error = new Error('AI 服务尚未配置 API Key。');
    error.status = 500;
    throw error;
  }

  const contextMessages = [{ role: 'system', content: currentChinaTimeContext() }, ...messages];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages: contextMessages })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || 'AI 请求失败。');
    error.status = response.status;
    throw error;
  }

  return cleanText(data?.choices?.[0]?.message?.content);
}

async function ownsPost(pool, postId, userId) {
  const { rows } = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
  if (rows.length === 0) return null;
  return rows[0].user_id === userId;
}

export function resetDailyQuoteCacheForTest() {
  dailyQuoteCache = { date: '', quote: '' };
}

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const { pool } = db;
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

  app.get('/', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, service: 'personal-site-api', db: 'connected' });
    } catch (error) {
      res.status(503).json({ ok: false, service: 'personal-site-api', db: 'disconnected', error: error.message });
    }
  });

  app.get('/api/ai/config', authRequired, (_req, res) => {
    res.json({
      enabled: Boolean(process.env.AI_API_KEY),
      baseUrl: cleanBaseUrl(process.env.AI_API_BASE_URL || DEFAULT_AI_API_BASE_URL),
      model: cleanText(process.env.AI_MODEL) || DEFAULT_AI_MODEL
    });
  });

  app.post('/api/ai/chat', authRequired, async (req, res) => {
    const prompt = cleanText(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({ message: '请输入要提问的内容。' });
    }

    try {
      const answer = await requestAiCompletion([{ role: 'user', content: prompt }]);
      return res.json({ answer });
    } catch (error) {
      return res.status(error.status || 502).json({ message: error.message || 'AI 服务暂时不可用。' });
    }
  });

  app.get('/api/ai/daily-quote', async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    if (dailyQuoteCache.date === today && dailyQuoteCache.quote) {
      return res.json({ quote: dailyQuoteCache.quote, date: today, cached: true });
    }

    try {
      const quote = await requestAiCompletion([
        {
          role: 'user',
          content: '请为个人网站“陈同学的秘密花园”生成一句今日签。要求：中文，温柔、诗意、青春、校园感，不超过40个字，不要解释，只输出句子。'
        }
      ]);
      dailyQuoteCache = { date: today, quote: quote || FALLBACK_DAILY_QUOTE };
      return res.json({ quote: dailyQuoteCache.quote, date: today, cached: false });
    } catch {
      return res.json({ quote: FALLBACK_DAILY_QUOTE, date: today, cached: false });
    }
  });

  // ----- 记录访问 -----
  app.post('/api/visit', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const path = cleanText(req.body?.path) || '/';
    const hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8);
    try {
      await pool.query('INSERT INTO visits (ip_hash, path) VALUES ($1, $2)', [hash, path]);
      res.json({ ok: true });
    } catch {
      res.status(200).json({ ok: false });
    }
  });

  // ----- 获取访问总数 -----
  app.get('/api/visits/count', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM visits');
      res.json({ total: rows[0].count });
    } catch {
      res.json({ total: 0 });
    }
  });

  // ----- 用户注册 -----
  app.post('/api/register', async (req, res) => {
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
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, password_salt)
         VALUES ($1, $2, $3)
         RETURNING id, username, created_at`,
        [username, hash, salt]
      );

      return res.status(201).json({ message: '注册成功。', user: publicUser(rows[0]) });
    } catch (error) {
      if (String(error.message).includes('UNIQUE') || String(error.code) === '23505') {
        return res.status(409).json({ message: '该用户名已经被注册。' });
      }
      return res.status(500).json({ message: '注册失败，请稍后重试。' });
    }
  });

  // ----- 用户登录 -----
  app.post('/api/login', async (req, res) => {
    const username = cleanText(req.body?.username);
    const password = cleanText(req.body?.password);

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ message: '用户名或密码错误。' });
    }

    return res.json({
      message: '登录成功。',
      token: createToken(user),
      user: publicUser(user)
    });
  });

  // ----- 获取当前用户个人资料（需认证） -----
  app.get('/api/user/profile', authRequired, async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, username, nickname, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: '用户不存在。' });
    return res.json(publicUser(rows[0]));
  });

  // ----- 修改当前用户个人资料（需认证） -----
  app.patch('/api/user/profile', authRequired, async (req, res) => {
    const nickname = req.body?.nickname !== undefined ? cleanText(req.body.nickname) : undefined;
    const avatarUrl = req.body?.avatarUrl !== undefined ? cleanText(req.body.avatarUrl) : undefined;

    if (nickname !== undefined && (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 24)) {
      return res.status(400).json({ message: '昵称长度需要在 1 到 24 个字符之间。' });
    }
    if (avatarUrl !== undefined && (typeof avatarUrl !== 'string' || avatarUrl.length > 512)) {
      return res.status(400).json({ message: '头像 URL 长度不能超过 512 个字符。' });
    }

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (nickname !== undefined) {
      setClauses.push(`nickname = $${idx++}`);
      params.push(nickname || null);
    }
    if (avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${idx++}`);
      params.push(avatarUrl || null);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: '没有需要修改的字段。' });
    }

    params.push(req.user.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING id, username, nickname, avatar_url, created_at`,
      params
    );

    return res.json(publicUser(rows[0]));
  });

  // ----- 查看公开用户个人资料（公开） -----
  app.get('/api/users/:id/profile', async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: '无效的用户 ID。' });

    const { rows } = await pool.query(
      'SELECT id, username, nickname, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: '用户不存在。' });
    return res.json(publicUser(rows[0]));
  });

  // ----- 获取帖子列表 -----
  app.get('/api/posts', async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const [postsResult, totalResult] = await Promise.all([
      pool.query(`
        SELECT posts.id, posts.title, posts.content,
               posts.created_at, posts.updated_at,
               users.username AS author
        FROM posts
        JOIN users ON users.id = posts.user_id
        ORDER BY posts.created_at DESC, posts.id DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*)::int AS count FROM posts')
    ]);

    res.json({
      items: postsResult.rows.map(postResponse),
      total: totalResult.rows[0].count,
      limit,
      offset
    });
  });

  // ----- 获取单篇帖子 -----
  app.get('/api/posts/:id', async (req, res) => {
    const { rows } = await pool.query(`
      SELECT posts.id, posts.title, posts.content,
             posts.created_at, posts.updated_at,
             users.username AS author
      FROM posts
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = $1
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ message: '没有找到这篇帖子。' });
    return res.json(postResponse(rows[0]));
  });

  // ----- 创建帖子 -----
  app.post('/api/posts', authRequired, async (req, res) => {
    const title = cleanText(req.body?.title);
    const content = cleanText(req.body?.content);

    if (!title || !content) {
      return res.status(400).json({ message: '标题和内容都不能为空。' });
    }

    if (title.length > 80 || content.length > 500000) {
      return res.status(400).json({ message: '标题或内容过长。' });
    }

    const { rows } = await pool.query(`
      INSERT INTO posts (user_id, title, content)
      VALUES ($1, $2, $3)
      RETURNING id, title, content, created_at, updated_at
    `, [req.user.id, title, content]);

    const post = rows[0];
    post.author = req.user.username;

    return res.status(201).json(postResponse(post));
  });

  // ----- 修改帖子 -----
  app.patch('/api/posts/:id', authRequired, async (req, res) => {
    const postId = Number(req.params.id);
    const allowed = await ownsPost(pool, postId, req.user.id);
    if (allowed === null) return res.status(404).json({ message: '没有找到这篇帖子。' });
    if (!allowed) return res.status(403).json({ message: '只能修改自己发布的帖子。' });

    const title = cleanText(req.body?.title);
    const content = cleanText(req.body?.content);

    if (!title || !content) return res.status(400).json({ message: '标题和内容都不能为空。' });
    if (title.length > 80 || content.length > 4000) return res.status(400).json({ message: '标题或内容过长。' });

    const { rows } = await pool.query(`
      UPDATE posts
      SET title = $1, content = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, title, content, created_at, updated_at
    `, [title, content, postId]);

    const post = rows[0];
    post.author = req.user.username;

    return res.json(postResponse(post));
  });

  // ----- 删除帖子 -----
  app.delete('/api/posts/:id', authRequired, async (req, res) => {
    const postId = Number(req.params.id);
    const allowed = await ownsPost(pool, postId, req.user.id);
    if (allowed === null) return res.status(404).json({ message: '没有找到这篇帖子。' });
    if (!allowed) return res.status(403).json({ message: '只能删除自己发布的帖子。' });

    const { rowCount } = await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
    if (rowCount === 0) return res.status(404).json({ message: '没有找到这篇帖子。' });
    return res.status(204).end();
  });

  // ----- 获取留言列表 -----
  app.get('/api/messages', async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const [messagesResult, totalResult] = await Promise.all([
      pool.query(`
        SELECT id, name, content, created_at
        FROM messages
        WHERE approved = 1
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query("SELECT COUNT(*)::int AS count FROM messages WHERE approved = 1")
    ]);

    res.json({
      items: messagesResult.rows.map(messageResponse),
      total: totalResult.rows[0].count,
      limit,
      offset
    });
  });

  // ----- 创建留言（无需登录） -----
  app.post('/api/messages', async (req, res) => {
    const name = cleanText(req.body?.name) || '匿名朋友';
    const content = cleanText(req.body?.content);
    const website = cleanText(req.body?.website);

    if (website) return res.status(400).json({ message: '提交失败，请稍后再试。' });
    if (!content) return res.status(400).json({ message: '留言内容不能为空。' });
    if (name.length > 24 || content.length > 5000) return res.status(400).json({ message: '昵称或留言内容过长。' });

    const { rows } = await pool.query(`
      INSERT INTO messages (name, content)
      VALUES ($1, $2)
      RETURNING id, name, content, created_at
    `, [name, content]);

    return res.status(201).json({ message: '留言成功。', item: messageResponse(rows[0]) });
  });

  // ----- 删除留言（需登录） -----
  app.delete('/api/messages/:id', authRequired, async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: '没有找到这条留言。' });
    return res.status(204).end();
  });

  // ----- SPA fallback -----
  app.get('*splat', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  return app;
}
