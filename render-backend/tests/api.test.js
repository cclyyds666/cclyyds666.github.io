import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function createTestDb() {
  const state = {
    users: [],
    posts: [],
    messages: [],
    visits: [],
    nextUserId: 1,
    nextPostId: 1,
    nextMessageId: 1,
    nextVisitId: 1,
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const withAuthor = (post) => ({
    ...post,
    author: state.users.find((user) => user.id === post.user_id)?.username,
  });

  return {
    pool: {
      async query(sql, params = []) {
        const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();

        if (text === 'select 1') return { rows: [{}] };
        if (text.startsWith('insert into users')) {
          const [username, passwordHash, passwordSalt] = params;
          if (state.users.some((user) => user.username === username)) {
            const error = new Error('duplicate username');
            error.code = '23505';
            throw error;
          }
          const row = {
            id: state.nextUserId++,
            username,
            password_hash: passwordHash,
            password_salt: passwordSalt,
            nickname: null,
            avatar_url: null,
            created_at: new Date().toISOString(),
          };
          state.users.push(row);
          return { rows: [copy(row)] };
        }
        if (text.startsWith('select * from users where username')) {
          return { rows: copy(state.users.filter((user) => user.username === params[0])) };
        }
        if (text.startsWith('select id, username, nickname, avatar_url, created_at from users where id')) {
          return { rows: copy(state.users.filter((user) => user.id === params[0])) };
        }
        if (text.startsWith('update users set')) {
          const user = state.users.find((item) => item.id === params[params.length - 1]);
          if (!user) return { rows: [] };
          if (text.includes('nickname')) user.nickname = params[0];
          if (text.includes('avatar_url')) user.avatar_url = params[text.includes('nickname') ? 1 : 0];
          return { rows: [copy(user)] };
        }
        if (text.startsWith('insert into posts')) {
          const [userId, title, content] = params;
          const row = {
            id: state.nextPostId++,
            user_id: userId,
            title,
            content,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          state.posts.push(row);
          return { rows: [copy(row)] };
        }
        if (text.startsWith('select user_id from posts where id')) {
          const post = state.posts.find((item) => item.id === Number(params[0]));
          return { rows: post ? [{ user_id: post.user_id }] : [] };
        }
        if (text.startsWith('select posts.id')) {
          const rows = state.posts.map(withAuthor).sort((a, b) => b.id - a.id);
          if (text.includes('where posts.id')) {
            return { rows: copy(rows.filter((post) => post.id === Number(params[0]))) };
          }
          return { rows: copy(rows.slice(params[1], params[1] + params[0])) };
        }
        if (text === 'select count(*)::int as count from posts') {
          return { rows: [{ count: state.posts.length }] };
        }
        if (text.startsWith('update posts')) {
          const [title, content, id] = params;
          const post = state.posts.find((item) => item.id === Number(id));
          if (!post) return { rows: [] };
          post.title = title;
          post.content = content;
          post.updated_at = new Date().toISOString();
          return { rows: [copy(post)] };
        }
        if (text.startsWith('delete from posts')) {
          const before = state.posts.length;
          state.posts = state.posts.filter((post) => post.id !== Number(params[0]));
          return { rowCount: before - state.posts.length };
        }
        if (text.startsWith('insert into messages')) {
          const [name, content] = params;
          const row = {
            id: state.nextMessageId++,
            name,
            content,
            approved: 1,
            created_at: new Date().toISOString(),
          };
          state.messages.push(row);
          return { rows: [copy(row)] };
        }
        if (text.startsWith('select id, name, content, created_at from messages')) {
          return { rows: copy(state.messages.filter((message) => message.approved === 1).sort((a, b) => b.id - a.id).slice(params[1], params[1] + params[0])) };
        }
        if (text === 'select count(*)::int as count from messages where approved = 1') {
          return { rows: [{ count: state.messages.filter((message) => message.approved === 1).length }] };
        }
        if (text.startsWith('delete from messages')) {
          const before = state.messages.length;
          state.messages = state.messages.filter((message) => message.id !== Number(params[0]));
          return { rowCount: before - state.messages.length };
        }
        if (text.startsWith('insert into visits')) {
          state.visits.push({ id: state.nextVisitId++, ip_hash: params[0], path: params[1] });
          return { rows: [] };
        }
        if (text === 'select count(*)::int as count from visits') {
          return { rows: [{ count: state.visits.length }] };
        }

        throw new Error(`Unsupported test query: ${sql}`);
      },
    },
    close() {},
  };
}

async function createUserAndToken(app, username = 'tester') {
  await request(app)
    .post('/api/register')
    .send({ username, password: 'secret123' });

  const login = await request(app)
    .post('/api/login')
    .send({ username, password: 'secret123' });

  return login.body.token;
}

describe('personal site API', () => {
  let app;
  let db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp({ db });
  });

  afterEach(() => {
    db.close();
  });

  it('serves the current frontend entry page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="postSection"');
    expect(res.text).toContain('loadPosts');
  });

  it('returns health status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'personal-site-api', db: 'connected' });
  });

  it('proxies ai chat requests through the backend', async () => {
    const token = await createUserAndToken(app, 'ai-user');
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: '你好，世界。' } }] })
    });

    try {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ baseUrl: 'https://api.example.com/v1', apiKey: 'test-key', model: 'demo-model', prompt: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBe('你好，世界。');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('proxies ai chat requests through the backend', async () => {
    const token = await createUserAndToken(app, 'ai-user');
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => ({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: '你好，世界。' } }] })
    });

    try {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ baseUrl: 'https://api.example.com/v1', apiKey: 'test-key', model: 'demo-model', prompt: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBe('你好，世界。');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('registers a user, logs in, and creates a post', async () => {
    const register = await request(app)
      .post('/api/register')
      .send({ username: 'tester', password: 'secret123' });

    expect(register.status).toBe(201);
    expect(register.body.user.username).toBe('tester');

    const login = await request(app)
      .post('/api/login')
      .send({ username: 'tester', password: 'secret123' });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();

    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ title: '第一篇测试文章', content: '这里是一段测试内容。' });

    expect(created.status).toBe(201);
    expect(created.body.author).toBe('tester');

    const posts = await request(app).get('/api/posts');

    expect(posts.status).toBe(200);
    expect(posts.body.items).toHaveLength(1);
    expect(posts.body.total).toBe(1);
    expect(posts.body.items[0].title).toBe('第一篇测试文章');
  });

  it('rejects post creation without login token', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({ title: '未登录文章', content: '不应该成功。' });

    expect(res.status).toBe(401);
  });

  it('updates and deletes posts owned by the logged-in user', async () => {
    const token = await createUserAndToken(app);
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '旧标题', content: '旧内容' });

    const updated = await request(app)
      .patch(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '新标题', content: '新内容' });

    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('新标题');

    const detail = await request(app).get(`/api/posts/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.content).toBe('新内容');

    const deleted = await request(app)
      .delete(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(204);

    const missing = await request(app).get(`/api/posts/${created.body.id}`);
    expect(missing.status).toBe(404);
  });

  it('blocks users from editing other users posts', async () => {
    const ownerToken = await createUserAndToken(app, 'owner');
    const otherToken = await createUserAndToken(app, 'other');
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: '别人的文章', content: '不能改' });

    const res = await request(app)
      .patch(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: '试图修改', content: '不应该成功' });

    expect(res.status).toBe(403);
  });

  it('creates and lists guestbook messages', async () => {
    const created = await request(app)
      .post('/api/messages')
      .send({ name: '访客', content: '网站很好看。' });

    expect(created.status).toBe(201);
    expect(created.body.item.name).toBe('访客');

    const messages = await request(app).get('/api/messages');

    expect(messages.status).toBe(200);
    expect(messages.body.items).toHaveLength(1);
    expect(messages.body.items[0].content).toBe('网站很好看。');
  });

  it('validates guestbook messages and honeypot submissions', async () => {
    const empty = await request(app)
      .post('/api/messages')
      .send({ name: '访客', content: '' });
    const bot = await request(app)
      .post('/api/messages')
      .send({ name: '访客', content: 'hello', website: 'https://spam.example' });

    expect(empty.status).toBe(400);
    expect(bot.status).toBe(400);
  });

  it('lets logged-in users delete messages', async () => {
    const token = await createUserAndToken(app);
    const created = await request(app)
      .post('/api/messages')
      .send({ name: '访客', content: '请删除我。' });

    const deleted = await request(app)
      .delete(`/api/messages/${created.body.item.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(204);

    const messages = await request(app).get('/api/messages');
    expect(messages.body.items).toHaveLength(0);
  });
});
