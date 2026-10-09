import { expect, type Page } from '@playwright/test';

/** 收集控制台错误与未捕获异常，测试结束时断言为空 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

/** 首次打开：走完引导（可选载入示例数据） */
export async function start(page: Page, opts: { sample?: boolean } = {}) {
  await page.goto('./');
  await expect(page.locator('#ob')).not.toHaveClass(/hide/);
  if (opts.sample) {
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
  for (const ch of seq) {
    const k = ch;
    await page.click(`#rec .key[data-k="${k}"]`);
  }
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
