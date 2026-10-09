import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, keys, amountVal, watchErrors, readKV } from './helpers';

test.describe('首次启动与记账', () => {
  test('空账本 + 默认分类和账户，记一笔支出（键盘算式）', async ({ page }) => {
    const errors = watchErrors(page);
    await start(page);
    await expect(page.locator('#p-home .empty')).toBeVisible();
    await page.click('#fab');
    await expect(page.locator('#rec')).toHaveClass(/open/);
    await expect(page.locator('#cats .cat:not(.manage)')).toHaveCount(8);
    await page.click('#cats .cat[data-c="food"]');
    await keys(page, '12+3.5');
    await expect(page.locator('#exprLine')).toHaveText('12 + 3.5 =');
    await expect(page.locator('#rec [data-k="ok"]')).toHaveText('=');
    await page.click('#rec [data-k="ok"]');
    await expect(amountVal(page)).toHaveText('15.50');
    await page.fill('#noteIn', '午饭');
    await page.click('#rec [data-k="ok"]');
    await expect(page.locator('#rec')).not.toHaveClass(/open/);
    const row = page.locator('#p-home .tx').first();
    await expect(row).toContainText('午饭');
    await expect(row).toContainText('-15.50');
    await expect(page.locator('#p-home .big')).toContainText('15', { timeout: 4000 });
    // 刷新后数据仍在（IndexedDB 持久化）
    await page.reload();
    await expect(page.locator('#p-home .tx').first()).toContainText('午饭');
    expect(errors).toEqual([]);
  });

  test('按「=」后结果统一两位小数：39.9 → 39.90，继续编辑不受影响', async ({ page }) => {
    await start(page);
    await page.click('#fab');
    await keys(page, '39.9');
    await expect(amountVal(page)).toHaveText('39.9');
    await keys(page, '+0');
    await page.click('#rec [data-k="ok"]');
    await expect(amountVal(page)).toHaveText('39.90');
    await keys(page, '+1');
    await expect(page.locator('#exprLine')).toHaveText('39.9 + 1 =');
    await page.click('#rec [data-k="ok"]');
    await expect(amountVal(page)).toHaveText('40.90');
  });

  test('收入、转账与账户余额', async ({ page }) => {
    await start(page);
    // 收入 1000 到微信钱包（默认账户）
    await page.click('#fab');
    await page.click('#recSeg [data-v="income"]');
    await page.locator('#cats .cat:not(.manage)').first().click();
    await keys(page, '1000');
    await page.click('#rec [data-k="ok"]');
    await expect(page.locator('#rec')).not.toHaveClass(/open/);
    // 资产页转账 200：微信钱包 → 支付宝
    await page.click('.tab[data-tab="assets"]');
    await page.click('#p-assets [data-act="transfer"]');
    await expect(page.locator('#rec')).toHaveAttribute('data-type', 'transfer');
    await keys(page, '200');
    await page.click('#rec [data-k="ok"]');
    await expect(page.locator('#rec')).not.toHaveClass(/open/);
    const li = (name: string) => page.locator('#p-assets .li', { hasText: name });
    await expect(li('微信钱包')).toContainText('¥800.00');
    await expect(li('支付宝')).toContainText('¥200.00');
    await expect(page.locator('#p-assets .big')).toContainText('1,000', { timeout: 4000 });
  });

  test('左滑删除与撤销', async ({ page }) => {
    await start(page);
    await page.click('#fab'); await keys(page, '8'); await page.click('#rec [data-k="ok"]');
    await expect(page.locator('#rec')).not.toHaveClass(/open/);
    await page.waitForTimeout(400);
    const main = page.locator('#p-home .tx .tx-main').first();
    const box = (await main.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width - 20 - i * 26, y);
    await page.mouse.up();
    await expect(page.locator('#p-home .tx')).toHaveCount(0);
    await expect(page.locator('#toast')).toContainText('撤销');
    await page.click('#toast button');
    await expect(page.locator('#p-home .tx')).toHaveCount(1);
  });
});

test.describe('导航与返回键', () => {
  test('系统 / 浏览器返回关闭二级页、弹层与记账面板', async ({ page }) => {
    await start(page, { sample: true });
    const url = page.url();
    await page.click('[data-go="search"]');
    await expect(page.locator('#subs .sub.in')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('#subs .sub.in')).toHaveCount(0);
    expect(page.url()).toBe(url);
    // 二级页内再进三级页，返回一级一级退
    await page.click('.tab[data-tab="me"]');
    await page.click('#p-me .tool[data-go="settings"]');
    await page.click('[data-act="currency"]');
    await expect(page.locator('#sheet')).toHaveClass(/show/);
    await page.goBack();
    await expect(page.locator('#sheet')).not.toHaveClass(/show/);
    await expect(page.locator('#subs .sub.in')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('#subs .sub.in')).toHaveCount(0);
    // 记账面板
    await page.click('#fab');
    await expect(page.locator('#rec')).toHaveClass(/open/);
    await page.goBack();
    await expect(page.locator('#rec')).not.toHaveClass(/open/);
    expect(page.url()).toBe(url);
  });

  test('主屏幕快捷方式 ?action=record 直接打开记一笔，并从地址栏移除参数', async ({ page }) => {
    await start(page);
    await page.goto('/?action=record');
    await expect(page.locator('#rec')).toHaveClass(/open/);
    expect(new URL(page.url()).search).toBe('');
  });

  test('原型录屏参数与调试接口不存在', async ({ page }) => {
    await page.goto('/?ob=0&tab=stats&theme=dark&go=budget');
    await expect(page.locator('#ob')).not.toHaveClass(/hide/);
    expect(await page.evaluate(() => 'ledger' in window || '__ledger' in window)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe('dark');
  });
});

test.describe('示例数据、搜索、统计', () => {
  test('载入示例数据 → 搜索 → 统计 → 一键清除', async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, { sample: true });
    await expect(page.locator('#p-home .tx').first()).toBeVisible();
    await page.click('[data-go="search"]');
    await page.fill('#sq', '咖啡'); await page.press('#sq', 'Enter');
    await expect(page.locator('#subs .sub .tx').first()).toContainText('咖啡');
    await page.goBack();
    await page.click('.tab[data-tab="stats"]');
    await expect(page.locator('#p-stats .donut, #p-stats svg').first()).toBeVisible();
    await page.click('.tab[data-tab="me"]');
    await page.click('#p-me .tool[data-go="settings"]');
    await page.click('[data-act="clearSample"]');
    await page.locator('#sheet [data-ok]').click();
    await page.goBack();
    await page.click('.tab[data-tab="home"]');
    await expect(page.locator('#p-home .tx')).toHaveCount(0);
    await page.click('.tab[data-tab="assets"]');
    await expect(page.locator('#p-assets .li')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
});

test.describe('设置', () => {
  test('应用锁：PIN 仅以加盐哈希保存，重启后需解锁，错误有提示', async ({ page }) => {
    await start(page);
    await page.click('.tab[data-tab="me"]');
    await page.click('#p-me .tool[data-go="settings"]');
    await page.click('[data-act="toggleLock"]');
    for (const k of '24682468') { await page.click(`#lock [data-n="${k}"]`); await page.waitForTimeout(60); }
    await expect(page.locator('#lock')).not.toHaveClass(/show/);
    await page.waitForTimeout(300);
    const settings = (await readKV(page, 'settings')).value;
    expect(settings.lock).toBe(true);
    expect(settings.pin.algo).toBe('PBKDF2-SHA256');
    expect(JSON.stringify(settings)).not.toContain('2468');
    await page.reload();
    await expect(page.locator('#lock')).toHaveClass(/show/);
    for (const k of '1111') await page.click(`#lock [data-n="${k}"]`);
    await expect(page.locator('#lkS')).toContainText('密码错误');
    for (const k of '2468') await page.click(`#lock [data-n="${k}"]`);
    await expect(page.locator('#lock')).not.toHaveClass(/show/);
  });

  test('导出 JSON 备份 → 清空 → 导入恢复', async ({ page }) => {
    await start(page, { sample: true });
    const n = await page.locator('#p-home .tx').count();
    await page.click('.tab[data-tab="me"]');
    await page.click('#p-me .tool[data-go="settings"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="exportJSON"]')]);
    const file = await dl.path();
    await page.click('[data-act="clearAll"]');
    await page.locator('#sheet [data-ok]').click();
    await page.waitForTimeout(400);
    await page.setInputFiles('#fileIn', file!);
    const ok = page.locator('#sheet [data-ok]');
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await expect(page.locator('#toast')).toContainText('导入');
    await page.goBack();
    await page.click('.tab[data-tab="home"]');
    await expect(page.locator('#p-home .tx')).toHaveCount(n);
  });

  test('导入原型导出的 CSV', async ({ page }) => {
    await start(page);
    const csv = '\uFEFF日期,类型,分类,金额,账户,转入账户,备注,账本,示例数据\r\n'
      + `${new Date().toISOString().slice(0, 7)}-01,支出,餐饮,23.5,微信钱包,,"早餐, 豆浆",日常账本,\r\n`
      + `${new Date().toISOString().slice(0, 7)}-01,转账,,100,微信钱包,支付宝,,日常账本,\r\n`;
    await page.click('.tab[data-tab="me"]');
    await page.click('#p-me .tool[data-go="settings"]');
    await page.setInputFiles('#fileIn', { name: 'ledger.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#toast')).toContainText('2');
    await page.goBack();
    await page.click('.tab[data-tab="home"]');
    await expect(page.locator('#p-home .tx').first()).toBeVisible();
    await expect(page.locator('#p-home')).toContainText('早餐, 豆浆');
  });
});

test.describe('PWA', () => {
  test('可安装：manifest 与 Service Worker 满足安装条件', async ({ baseURL }) => {
    // 默认测试上下文是无痕模式（Chrome 会报 in-incognito），这里用持久化上下文检查真实的可安装性
    const dir = mkdtempSync(join(tmpdir(), 'xzb-'));
    const chrome = process.env.CHROME || '/usr/bin/google-chrome';
    const ctx = await chromium.launchPersistentContext(dir, { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(baseURL!);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const manifest = await (await page.request.get(baseURL + 'manifest.webmanifest')).json();
      expect(manifest.name).toBe('小账本');
      expect(manifest.display).toBe('standalone');
      expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
      const cdp = await ctx.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors).toEqual([]);
    } finally { await ctx.close(); }
  });

  test('离线：断网后重新打开并记一笔', async ({ page, context }) => {
    const errors = watchErrors(page);
    await start(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // 让 SW 接管页面
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#tabbar')).toBeVisible();
    await page.click('#fab');
    await keys(page, '6.6');
    await page.click('#rec [data-k="ok"]');
    await expect(page.locator('#p-home .tx').first()).toContainText('-6.60');
    await page.reload();
    await expect(page.locator('#p-home .tx').first()).toContainText('-6.60');
    await context.setOffline(false);
    expect(errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(e))).toEqual([]);
  });
});
