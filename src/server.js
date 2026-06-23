import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
let app;

async function main() {
  app = createApp();

  try {
    await app.locals.db.migrate();
    console.log('数据库迁移完成，已连接到 Neon (PostgreSQL)。');
  } catch (error) {
    console.error('数据库迁移失败:', error.message);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Personal site server running at http://localhost:${port}`);
  });
}

async function shutdown() {
  console.log('正在关闭数据库连接…');
  try {
    await app?.locals.db.close();
  } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
