import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);

let appInstance;

async function main() {
  const app = createApp();
  appInstance = app;

  try {
    await app.locals.db.migrate();
    console.log('数据库迁移完成，已连接到 Neon (PostgreSQL)。');
  } catch (error) {
    console.error('数据库迁移失败:', error.message);
    process.exit(1);
  }

  // 验证迁移后的数据
  try {
    const { rows } = await app.locals.db.pool.query('SELECT COUNT(*)::int AS count FROM users');
    console.log(`数据库中有 ${rows[0].count} 个用户`);
  } catch (e) {
    console.log('数据库查询验证跳过（可能表不存在）');
  }

  app.listen(port, () => {
    console.log(`Personal site server running at http://localhost:${port}`);
  });
}

async function shutdown() {
  console.log('正在关闭数据库连接…');
  try {
    if (appInstance?.locals?.db) {
      await appInstance.locals.db.close();
    }
  } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
