// 设计评审截图：启动本地后端（临时 SQLite）+ 示例数据，按 iPhone 尺寸（390×844 @2x）截取主要页面的浅色/深色图
// 用法：npm run build && npm --prefix server run build && node scripts/shots.mjs <输出目录> [页面,...]
// 不使用任何真实账号：临时用户与临时数据库在结束后删除
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'release/screenshots/v2');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PORT = 4191, ORIGIN = `http://localhost:${PORT}`;
const DATA = '/tmp/xzb-shots-data';
rmSync(DATA, { recursive: true, force: true }); mkdirSync(DATA, { recursive: true }); mkdirSync(OUT, { recursive: true });
const env = { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), PUBLIC_ORIGIN: ORIGIN, DB_PATH: `${DATA}/db.sqlite`, COOKIE_SECURE: 'true', SCRYPT_N: '16384', AUTH_RATE_LIMIT: '1000', LOG_LEVEL: 'warn' };
const srv = spawn(process.execPath, ['server/dist/index.js'], { env, stdio: 'inherit' });
const stop = () => { try { srv.kill(); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 50; i++) { try { if ((await fetch(ORIGIN + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }

const PW = 'shots-' + Math.random().toString(36).slice(2) + '-pw';
const mk = email => execFileSync(process.execPath, ['server/dist/cli.js', 'create-user', email, '--password-stdin'], { input: PW + '\n', env });
for (const s of ['light', 'dark']) { mk(`demo-${s}@example.com`); mk(`empty-${s}@example.com`); }

const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] });
const errors = [];
const settle = (p, ms = 1200) => p.waitForTimeout(ms);
async function newCtx(scheme) {
  const c = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  return c;
}
function watch(p, tag) { p.on('console', m => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(`[${tag}] ${m.text()}`); }); p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`)); }
async function login(p, email) {
  await p.goto('/login'); await settle(p, 600);
  await p.fill('#email', email); await p.fill('#password', PW); await p.click('#submit');
  await p.waitForURL(u => new URL(u).pathname === '/'); await settle(p, 1200);
}
const want = n => !ONLY || ONLY.includes(n);

for (const scheme of ['light', 'dark']) {
  // 登录页
  if (want('login')) {
    const c = await newCtx(scheme); const p = await c.newPage(); watch(p, 'login-' + scheme);
    await p.goto('/login'); await settle(p, 1500);
    await p.screenshot({ path: `${OUT}/login-${scheme}.png` });
    if (scheme === 'light') {
      await p.fill('#email', 'demo-light@example.com'); await p.fill('#password', 'wrong-password'); await p.click('#submit'); await settle(p, 1500);
      await p.screenshot({ path: `${OUT}/login-error-${scheme}.png` });
    }
    await c.close();
  }
  // 空状态（新账号跳过引导）
  if (want('empty')) {
    const c = await newCtx(scheme); const p = await c.newPage(); watch(p, 'empty-' + scheme);
    await login(p, `empty-${scheme}@example.com`);
    if (await p.locator('#ob:not(.hide) [data-ob="skip"]').count()) { await p.click('[data-ob="skip"]'); await settle(p, 900); }
    await p.screenshot({ path: `${OUT}/empty-${scheme}.png` });
    await c.close();
  }
  // 示例数据
  const c = await newCtx(scheme); const p = await c.newPage(); watch(p, 'app-' + scheme);
  await login(p, `demo-${scheme}@example.com`);
  if (await p.locator('#ob:not(.hide)').count()) {
    if (want('onboarding')) await p.screenshot({ path: `${OUT}/onboarding-${scheme}.png` });
    await p.click('[data-ob="next"]'); await settle(p, 400); await p.click('[data-ob="next"]'); await settle(p, 500);
    await p.click('[data-ob="sample"]'); await settle(p, 1500);
  }
  const home = async () => { await p.goto('/'); await settle(p, 1400); if (await p.locator('[data-act="dismissInstall"]').count()) { await p.click('[data-act="dismissInstall"]'); await settle(p, 500); } };
  const steps = {
    home: async () => {},
    record: async () => { await p.click('#fab'); await settle(p, 900); for (const k of ['3', '9', '.', '9']) await p.click(`.key[data-k="${k}"]`); },
    bills: async () => { await p.evaluate(() => document.querySelector('#p-home .filters')?.scrollIntoView({ block: 'start' })); },
    detail: async () => { await p.click('#p-home .tx-main >> nth=0'); },
    stats: async () => { await p.click('.tab[data-tab="stats"]'); },
    assets: async () => { await p.click('.tab[data-tab="assets"]'); },
    me: async () => { await p.click('.tab[data-tab="me"]'); },
    account: async () => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="account"]'); },
    budget: async () => { await p.click('[data-go="budget"] >> nth=0'); },
    settings: async () => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me .tool[data-go="settings"]'); },
    calendar: async () => { await p.click('[data-go="calendar"]'); },
    acctsheet: async () => { await p.click('#fab'); await settle(p, 900); await p.click('#acctChip'); },
    transfer: async () => { await p.click('.tab[data-tab="assets"]'); await settle(p, 500); await p.click('#p-assets [data-act="transfer"]'); await settle(p, 700); for (const k of ['5', '0', '0']) await p.click(`.key[data-k="${k}"]`); },
    catedit: async () => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="cats"]'); await settle(p, 700); await p.click('#catList [data-go="catEdit"] >> nth=0'); },
  };
  for (const [n, fn] of Object.entries(steps)) {
    if (!want(n)) continue;
    await home(); await fn(); await settle(p, 1300);
    await p.screenshot({ path: `${OUT}/${n}-${scheme}.png` });
  }
  await c.close();
}
await browser.close(); stop();
rmSync(DATA, { recursive: true, force: true });
if (errors.length) { console.error('控制台错误：\n' + errors.join('\n')); process.exitCode = 1; }
console.log('截图已保存到', OUT);
