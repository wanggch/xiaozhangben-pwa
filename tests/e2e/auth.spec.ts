import { test, expect } from '@playwright/test';
import { createUser, apiLogin, uiLogin, passOnboarding, recordExpense, cloudRecords, watchErrors, PASSWORD, readKV } from './helpers';

test.describe('访问控制', () => {
  test('未登录：页面跳转登录页，App 脚本与 API 都被拒绝', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('h1')).toHaveText('小账本');
    await expect(page.locator('#toggle')).toBeHidden(); // 注册默认关闭
    const html = await page.request.get('/index.html', { maxRedirects: 0 });
    expect(html.status()).toBe(302);
    const js = (await (await page.request.get('/login')).text()).match(/\/pub\/login-[\w-]+\.js/)![0];
    expect((await page.request.get(js)).status()).toBe(200);
    const appJs = await page.request.get('/assets/does-not-matter.js');
    expect(appJs.status()).toBe(401);
    expect((await page.request.get('/api/sync/pull')).status()).toBe(401);
    expect((await page.request.post('/api/auth/signup', { data: { email: 'x@e2e.test', password: '12345678' }, headers: { origin: 'http://localhost:4179' } })).status()).toBe(403);
    expect(errors).toEqual([]);
  });

  test('登录页：错误密码提示，正确密码进入 App；会话 Cookie 为 HttpOnly + Secure + SameSite=Lax', async ({ page, context }) => {
    const u = createUser();
    await page.goto('/login');
    await page.fill('#email', u.email); await page.fill('#password', 'wrong password');
    await page.click('#submit');
    await expect(page.locator('#err')).toHaveText('邮箱或密码错误');
    await uiLogin(page, u.email);
    await passOnboarding(page);
    const c = (await context.cookies()).find(c => c.name === '__Host-xzb_sid')!;
    expect(c.httpOnly).toBe(true); expect(c.secure).toBe(true); expect(c.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('xzb_sid');
    await page.click('.tab[data-tab="me"]');
    await expect(page.locator('#p-me .acct-email')).toHaveText(u.email);
  });
});

test.describe('云同步', () => {
  test('记账后同步到服务端；第二个浏览器上下文登录后看到同一数据', async ({ page, browser }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    await recordExpense(page, '23.45', '同步测试');
    await expect.poll(async () => (await cloudRecords(page)).find(r => r.kind === 'tx')?.data.amount, { timeout: 10_000 }).toBe(2345);
    const tx = (await cloudRecords(page)).find(r => r.kind === 'tx')!;
    expect(tx.data.note).toBe('同步测试');
    // 设备二
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await uiLogin(p2, u.email);
    await expect(p2.locator('#p-home .tx').first()).toContainText('同步测试', { timeout: 10_000 });
    await expect(p2.locator('#p-home .tx').first()).toContainText('-23.45');
    // 设备二修改备注 → 设备一拉取后看到（last-write-wins）
    await passOnboarding(p2);
    await p2.locator('#p-home .tx .tx-main').first().click();
    await p2.click('[data-act="editTx"]');
    await p2.fill('#noteIn', '设备二改过');
    await p2.click('#rec [data-k="ok"]');
    await expect.poll(async () => (await cloudRecords(p2)).find(r => r.kind === 'tx')?.data.note, { timeout: 10_000 }).toBe('设备二改过');
    await page.click('.tab[data-tab="me"]'); await page.click('#p-me [data-go="account"]');
    await page.click('[data-act="syncNow"]');
    await expect(page.locator('[data-testid="sync-status"]')).toHaveText('已同步');
    await page.goBack(); await page.click('.tab[data-tab="home"]');
    await expect(page.locator('#p-home .tx').first()).toContainText('设备二改过');
    await ctx2.close();
  });

  test('离线记账，联网后自动同步', async ({ page, context }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload(); // 离线打开（Service Worker 缓存）
    await expect(page.locator('#tabbar')).toBeVisible();
    await recordExpense(page, '8.8', '离线记的');
    await page.click('.tab[data-tab="me"]');
    await expect(page.locator('#meSync')).toContainText('离线');
    expect((await cloudRecords(page)).some(r => r.kind === 'tx')).toBe(false); // 测试的 API 请求不受离线模拟影响，可直接查看云端
    await context.setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await expect(page.locator('#meSync')).toHaveText('已同步', { timeout: 10_000 });
    expect((await cloudRecords(page)).find(r => r.kind === 'tx')?.data.note).toBe('离线记的');
  });

  test('删除同步为墓碑；应用锁 PIN 不上传', async ({ page }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    await recordExpense(page, '5');
    await expect.poll(async () => (await cloudRecords(page)).some(r => r.kind === 'tx' && !r.deleted), { timeout: 10_000 }).toBe(true);
    await page.locator('#p-home .tx .tx-main').first().click();
    await page.click('[data-act="delTx"]');
    await page.click('#sheet [data-ok]');
    await expect.poll(async () => (await cloudRecords(page)).find(r => r.kind === 'tx')?.deleted, { timeout: 10_000 }).toBe(true);
    // 应用锁
    await page.click('.tab[data-tab="me"]'); await page.click('#p-me .tool[data-go="settings"]');
    await page.click('[data-act="toggleLock"]');
    for (const k of '13571357') { await page.click(`#lock [data-n="${k}"]`); await page.waitForTimeout(60); }
    await expect(page.locator('#lock')).not.toHaveClass(/show/);
    await page.waitForTimeout(2500);
    const settings = (await cloudRecords(page)).find(r => r.kind === 'settings')!;
    expect(settings.data).not.toHaveProperty('pin'); expect(settings.data).not.toHaveProperty('lock');
    expect((await readKV(page, 'settings')).value.pin.algo).toBe('PBKDF2-SHA256');
  });

  test('首次在本设备登录且本机已有数据：选择「用云端数据覆盖」', async ({ page, browser }) => {
    const u = createUser();
    // 设备一先上传一笔
    const ctx1 = await browser.newContext(); const p1 = await ctx1.newPage();
    await apiLogin(p1, u.email); await p1.goto('/'); await passOnboarding(p1);
    await recordExpense(p1, '66', '云端的');
    await expect.poll(async () => (await cloudRecords(p1)).some(r => r.kind === 'tx'), { timeout: 10_000 }).toBe(true);
    await ctx1.close();
    // 设备二：登录后记一笔，再模拟「本设备从未与该账号同步过」
    await apiLogin(page, u.email); await page.goto('/');
    await expect(page.locator('#p-home .tx')).toHaveCount(1, { timeout: 10_000 });
    await passOnboarding(page);
    await recordExpense(page, '7', '本机的');
    await page.waitForTimeout(2500);
    await page.evaluate(() => new Promise(res => { const r = indexedDB.open('xiaozhangben'); r.onsuccess = () => { const t = r.result.transaction(['kv', 'syncbase'], 'readwrite'); t.objectStore('kv').delete('sync'); t.objectStore('syncbase').clear(); t.oncomplete = () => { r.result.close(); res(null); }; }; }));
    // 本机再加一笔未上传的
    await page.reload();
    await expect(page.locator('#sheet')).toHaveClass(/show/);
    await expect(page.locator('#sheet')).toContainText('本机已有账本数据');
    await page.click('#sheet [data-c="cloud"]');
    await expect(page.locator('#toast')).toContainText('同步完成', { timeout: 10_000 });
    await expect(page.locator('#p-home .tx')).toHaveCount(2);
  });
});

test.describe('退出与账号', () => {
  test('退出登录：清除本机数据、缓存与 Service Worker，回到登录页；再次登录从云端恢复', async ({ page }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await recordExpense(page, '12', '退出前');
    await page.click('.tab[data-tab="me"]'); await page.click('#p-me [data-go="account"]');
    await page.click('[data-act="logout"]');
    await page.click('#sheet [data-ok]');
    await page.waitForURL(/\/login/);
    await expect(page.locator('#notice')).toContainText('已退出登录');
    const local = await page.evaluate(async () => ({
      dbs: (await indexedDB.databases()).map(d => d.name),
      caches: await caches.keys(),
      sw: (await navigator.serviceWorker.getRegistrations()).length,
      ls: Object.keys(localStorage).filter(k => k.startsWith('xzb-')),
    }));
    expect(local).toEqual({ dbs: [], caches: [], sw: 0, ls: [] });
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
    await uiLogin(page, u.email);
    await expect(page.locator('#p-home .tx').first()).toContainText('退出前', { timeout: 10_000 });
  });

  test('会话在服务器上被吊销：下次打开跳转登录页', async ({ page }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    await page.request.post('/api/auth/logout', { headers: { origin: 'http://localhost:4179' } });
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test('修改密码后其他设备下线；注销账号删除云端数据', async ({ page, browser }) => {
    const u = createUser();
    await apiLogin(page, u.email); await page.goto('/'); await passOnboarding(page);
    const ctx2 = await browser.newContext(); await apiLogin(ctx2, u.email);
    await page.click('.tab[data-tab="me"]'); await page.click('#p-me [data-go="account"]');
    await page.click('[data-act="changePassword"]');
    await page.fill('#pwCur', PASSWORD); await page.fill('#pwNew', 'brand new pw 9'); await page.fill('#pwNew2', 'brand new pw 9');
    await page.click('#sheet [data-ok]');
    await expect(page.locator('#toast')).toContainText('1 台其他设备已退出');
    expect((await ctx2.request.get('/api/auth/me')).status()).toBe(401);
    await ctx2.close();
    await page.click('[data-act="deleteAccount"]');
    await page.fill('#delPw', 'brand new pw 9');
    await page.click('#sheet [data-ok]');
    await page.waitForURL(/\/login/);
    await expect(page.locator('#notice')).toContainText('账号已注销');
    expect((await page.request.post('/api/auth/login', { data: { email: u.email, password: 'brand new pw 9' }, headers: { origin: 'http://localhost:4179' } })).status()).toBe(401);
  });
});
