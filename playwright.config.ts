import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// 优先使用系统 Chrome（CI 中可设置 CHROME 环境变量或执行 npx playwright install chromium）
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = 4179;
// 与构建时相同的子路径（GitHub Pages：BASE=/xiaozhangben-pwa/）
const BASE = process.env.BASE || '/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
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
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
