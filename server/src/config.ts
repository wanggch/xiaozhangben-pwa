/** 运行配置：全部来自环境变量（见 .env.example），不在仓库中保存任何密钥 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bool = (v: string | undefined, d: boolean) => v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v);
const int = (v: string | undefined, d: number) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };

export interface Config {
  host: string; port: number;
  dbPath: string; webRoot: string;
  publicOrigin: string | null;
  allowSignup: boolean;
  cookieSecure: boolean;
  trustProxy: string | boolean;
  sessionDays: number; sessionMaxDays: number;
  maxRecordsPerUser: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicOrigin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null;
  return {
    host: env.HOST || '127.0.0.1',
    port: int(env.PORT, 8787),
    dbPath: resolve(env.DB_PATH || resolve(env.DATA_DIR || './data', 'xiaozhangben.db')),
    // 默认使用仓库根目录的前端构建产物 dist/（部署包中为 ../web）
    webRoot: resolve(env.WEB_ROOT || resolve(here, '../../dist')),
    publicOrigin,
    allowSignup: bool(env.ALLOW_SIGNUP, false),
    // 默认开启 Secure；只有明确以 http:// 访问（本地调试）时才关闭
    cookieSecure: bool(env.COOKIE_SECURE, !(publicOrigin?.startsWith('http://'))),
    trustProxy: env.TRUST_PROXY === undefined ? 'loopback' : (/^(true|false)$/i.test(env.TRUST_PROXY) ? env.TRUST_PROXY.toLowerCase() === 'true' : env.TRUST_PROXY),
    sessionDays: int(env.SESSION_DAYS, 30),
    sessionMaxDays: int(env.SESSION_MAX_DAYS, 180),
    maxRecordsPerUser: int(env.MAX_RECORDS_PER_USER, 200_000),
    logLevel: env.LOG_LEVEL || 'info',
  };
}
