import { expect, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { E2E_ENV } from '../../playwright.config';

export const PASSWORD = 'e2e password 123';
const ORIGIN = E2E_ENV.PUBLIC_ORIGIN;

/** 收集控制台错误与未捕获异常，测试结束时断言为空 */
export function watchErrors(page: Page, ignore: RegExp[] = []) {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error' && !ignore.some(r => r.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

/** 用服务器 CLI 创建账号（与生产环境创建第一个账号的方式相同） */
export function createUser(email = `u-${randomBytes(5).toString('hex')}@e2e.test`, password = PASSWORD) {
  execFileSync(process.execPath, ['server/dist/cli.js', 'create-user', email, '--password-stdin'], { input: password + '\n', env: { ...process.env, ...E2E_ENV } });
  return { email, password };
}

/** 通过 API 登录（Cookie 写入浏览器上下文） */
export async function apiLogin(ctx: BrowserContext | Page, email: string, password = PASSWORD) {
  const r = await ctx.request.post('/api/auth/login', { data: { email, password }, headers: { origin: ORIGIN } });
  expect(r.status(), await r.text()).toBe(200);
}

/** 通过登录页登录 */
export async function uiLogin(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.fill('#email', email); await page.fill('#password', password);
  await page.click('#submit');
  await page.waitForURL(u => new URL(u).pathname === '/');
}

/** 新账号登录并走完引导（可选载入示例数据） */
export async function start(page: Page, opts: { sample?: boolean; user?: { email: string } } = {}) {
  const user = opts.user ?? createUser();
  await apiLogin(page, user.email);
  await page.goto('./');
  await passOnboarding(page, opts.sample);
  return user;
}
export async function passOnboarding(page: Page, sample = false) {
  await expect(page.locator('#ob')).not.toHaveClass(/hide/);
  if (sample) {
    await page.click('[data-ob="next"]'); await page.click('[data-ob="next"]');
    await page.click('[data-ob="sample"]');
  } else {
    await page.click('[data-ob="skip"]');
  }
  await expect(page.locator('#ob')).toHaveClass(/hide/);
  await page.waitForTimeout(500);
}

/** 用键盘输入一串按键，例如 "12+3.5" */
export async function keys(page: Page, seq: string) {
  for (const ch of seq) await page.click(`#rec .key[data-k="${ch}"]`);
}

export const amountVal = (page: Page) => page.locator('#amountDisp .val');

/** 读取 IndexedDB 中的原始记录（验证持久化与 PIN 存储方式） */
export function readKV(page: Page, key: string) {
  return page.evaluate(k => new Promise<any>((res, rej) => {
    const r = indexedDB.open('xiaozhangben');
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); };
    r.onerror = () => rej(r.error);
  }), key);
}

/** 服务端视角：拉取该账号的全部云端记录 */
export async function cloudRecords(ctx: BrowserContext | Page) {
  const r = await ctx.request.get('/api/sync/pull?since=0&limit=2000');
  expect(r.status()).toBe(200);
  return (await r.json()).changes as { kind: string; id: string; deleted: boolean; data: any }[];
}

/** 记一笔支出（默认分类），返回金额文本 */
export async function recordExpense(page: Page, amount: string, note?: string) {
  await page.click('#fab');
  await expect(page.locator('#rec')).toHaveClass(/open/);
  await keys(page, amount);
  if (note) await page.fill('#noteIn', note);
  await page.click('#rec [data-k="ok"]');
  await expect(page.locator('#rec')).not.toHaveClass(/open/);
}
