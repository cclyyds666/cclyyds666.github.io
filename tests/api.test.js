import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('personal site API', () => {
  let app;
  let db;

  beforeEach(() => {
    app = createApp({ dbPath: ':memory:' });
    db = app.locals.db;
  });

  afterEach(() => {
    db.close();
  });

  it('serves the current frontend entry page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="blog-section"');
    expect(res.text).toContain('/api/login');
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
    expect(posts.body).toHaveLength(1);
    expect(posts.body[0].title).toBe('第一篇测试文章');
  });

  it('rejects post creation without login token', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({ title: '未登录文章', content: '不应该成功。' });

    expect(res.status).toBe(401);
  });
});
