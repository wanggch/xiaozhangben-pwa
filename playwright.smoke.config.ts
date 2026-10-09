/**
 * 部署后冒烟测试（针对已运行的服务器，不启动本地服务）：
 *   SMOKE_URL=https://ledger.example.com SMOKE_EMAIL=... SMOKE_PASSWORD=... npx playwright test -c playwright.smoke.config.ts
 * 自签证书（tls internal）加 SMOKE_INSECURE=1。会新增并删除一笔测试账单（云端留下一条删除记录）。
 */
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = process.env.CHROME || '/usr/bin/google-chrome';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_URL,
    ignoreHTTPSErrors: process.env.SMOKE_INSECURE === '1',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    launchOptions: { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
});
