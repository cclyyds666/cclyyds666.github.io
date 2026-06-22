import pg from 'pg';

const { Pool } = pg;

/**
 * 创建 Neon (PostgreSQL) 连接池并执行表结构迁移。
 * @param {string} [connectionString=process.env.DATABASE_URL]
 * @returns {{ pool: pg.Pool, migrate: () => Promise<void>, close: () => Promise<void> }}
 */
export function createDatabase(connectionString) {
  const url = connectionString || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL 环境变量未设置。请设置 DATABASE_URL 指向 Neon PostgreSQL 数据库。'
    );
  }

  const pool = new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  /**
   * 执行表结构迁移（建表 + 索引）。
   * 使用 IF NOT EXISTS，多次调用安全。
   */
  async function migrate() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          approved INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 索引（IF NOT EXISTS 对索引无效，用 DO 块保护）
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_posts_created_at') THEN
            CREATE INDEX idx_posts_created_at ON posts(created_at DESC, id DESC);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_posts_user_id') THEN
            CREATE INDEX idx_posts_user_id ON posts(user_id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_approved_created_at') THEN
            CREATE INDEX idx_messages_approved_created_at ON messages(approved, created_at DESC, id DESC);
          END IF;
        END;
        $$;
      `);

      // nickname / avatar_url 列迁移（DO 块保护，避免重复列错误）
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname') THEN
            ALTER TABLE users ADD COLUMN nickname TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
            ALTER TABLE users ADD COLUMN avatar_url TEXT;
          END IF;
        END;
        $$;
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 关闭连接池（应用退出时调用）。
   */
  async function close() {
    await pool.end();
  }

  return { pool, migrate, close };
}
