import { test, expect } from '@playwright/test';
import { recordExpense, cloudRecords } from '../e2e/helpers';

const EMAIL = process.env.SMOKE_EMAIL!, PASSWORD = process.env.SMOKE_PASSWORD!;
test.skip(!process.env.SMOKE_URL || !EMAIL || !PASSWORD, '需要 SMOKE_URL / SMOKE_EMAIL / SMOKE_PASSWORD');

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD);
  await page.click('#submit');
  await page.waitForURL(u => new URL(u).pathname === '/');
  // 首次登录可能出现引导或数据选择
  const ob = page.locator('#ob:not(.hide) [data-ob="skip"]');
  await page.waitForTimeout(800);
  if (await ob.isVisible()) await ob.click();
}

test('线上：未登录被拦截 → 登录 → 记账同步 → 另一设备可见 → 删除', async ({ page, browser, request }) => {
  expect((await request.get('/api/sync/pull?since=0')).status()).toBe(401);
  const res = await request.get('/', { maxRedirects: 0 });
  expect(res.status()).toBe(302);

  await login(page);
  const note = `冒烟-${Date.now()}`;
  await recordExpense(page, '1.23', note);
  let id = '';
  await expect.poll(async () => (id = (await cloudRecords(page)).find(r => r.kind === 'tx' && !r.deleted && r.data?.note === note)?.id ?? '')).not.toBe('');
  await page.screenshot({ path: 'release/screenshots/deployed-home.png' });

  const ctx2 = await browser.newContext({ ignoreHTTPSErrors: process.env.SMOKE_INSECURE === '1', baseURL: process.env.SMOKE_URL });
  const p2 = await ctx2.newPage();
  await login(p2);
  await expect(p2.locator('#p-home .tx', { hasText: note }).first()).toBeVisible();
  await ctx2.close();

  await page.locator('#p-home .tx', { hasText: note }).locator('.tx-main').first().click();
  await page.click('[data-act="delTx"]');
  await page.click('#sheet [data-ok]');
  await expect.poll(async () => (await cloudRecords(page)).some(r => r.id === id && r.deleted)).toBe(true);
});
