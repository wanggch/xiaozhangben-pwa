/** 服务入口：读取环境变量 → 打开数据库并迁移 → 启动 HTTP 服务（默认只监听 127.0.0.1，由 Caddy 反代） */
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildApp } from './app.js';
import { existsSync } from 'node:fs';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const app = buildApp(cfg, db);
if (!existsSync(cfg.webRoot)) app.log.warn({ webRoot: cfg.webRoot }, '未找到前端构建产物，只提供 API');
if (!cfg.publicOrigin) app.log.warn('未设置 PUBLIC_ORIGIN，将按请求的 Host 校验 Origin（生产环境请设置）');

const shutdown = async (sig: string) => {
  app.log.info({ sig }, 'shutting down');
  try { await app.close(); } finally { db.close(); process.exit(0); }
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: cfg.host, port: cfg.port });
app.log.info({ db: cfg.dbPath, web: cfg.webRoot, signup: cfg.allowSignup, secureCookie: cfg.cookieSecure }, '小账本服务已启动');
