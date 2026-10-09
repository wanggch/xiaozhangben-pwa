import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// 优先使用系统 Chrome（CI 中可设置 CHROME 环境变量或执行 npx playwright install chromium）
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = 4179;
export const E2E_DB = '.e2e-data/e2e.db';
// 测试用后端：真实 Node 服务 + 临时 SQLite；Secure Cookie 与生产一致（localhost 属于安全上下文）
export const E2E_ENV = {
  HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: E2E_DB, PUBLIC_ORIGIN: `http://localhost:${PORT}`,
  COOKIE_SECURE: 'true', ALLOW_SIGNUP: 'false', SCRYPT_N: '16384', LOG_LEVEL: 'warn', AUTH_RATE_LIMIT: '1000',
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    serviceWorkers: 'allow',
    launchOptions: { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] },
  },
  webServer: {
    command: `rm -rf .e2e-data && node server/dist/index.js`,
    url: `http://localhost:${PORT}/api/health`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
