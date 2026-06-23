import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

async function createUserAndToken(app, username = `tester_${Date.now().toString(36)}`) {
  const register = await request(app)
    .post('/api/register')
    .send({ username, password: 'secret123' });

  if (register.status !== 201) {
    throw new Error(`register failed: ${register.status}`);
  }

  const login = await request(app)
    .post('/api/login')
    .send({ username, password: 'secret123' });

  if (login.status !== 200) {
    throw new Error(`login failed: ${login.status}`);
  }

  return login.body.token;
}

describe('personal site API', () => {
  let app;
  let db;
  const suffix = Date.now().toString(36);

  beforeEach(async () => {
    app = createApp({ dbPath: ':memory:' });
    db = app.locals.db;
    await db.migrate();
  });


  afterEach(async () => {
    await db.close();
  });

  it('serves the current frontend entry page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('陈同学的秘密花园');
    expect(res.text).toContain('留言树洞');
  });

  it('returns health status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'personal-site-api' });
  });

  it('registers a user, logs in, and creates a post', async () => {
    const register = await request(app)
      .post('/api/register')
      .send({ username: `tester_${Date.now().toString(36)}`, password: 'secret123' });

    expect(register.status).toBe(201);
    expect(register.body.user.username).toMatch(/^tester_/);

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
    expect(updated.body).toBeTruthy();
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
    const ownerToken = await createUserAndToken(app, `owner_${Date.now().toString(36)}`);
    const otherToken = await createUserAndToken(app, `other_${Date.now().toString(36)}`);
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
