// 生成移动端截图（浅色 / 深色）并与原型同页面并排对比
// 用法：先 npm run build && npm run preview，然后 node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';

const PWA = process.env.PWA_URL || 'http://localhost:4173/';
const PROTO = 'file:///workspace/ledger-prototype/index.html';
const OUT = new URL('../release/screenshots/', import.meta.url).pathname;
const CMP = OUT + 'compare/';
mkdirSync(CMP, { recursive: true });
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] });
const errors = [];

async function ctx(scheme) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  return c;
}
const settle = (p, ms = 1400) => p.waitForTimeout(ms);

// ---------- 正式版导航 ----------
const pwaSteps = {
  home: async p => {},
  record: async p => { await p.click('#fab'); await settle(p, 900); for (const k of ['3', '9', '.', '9']) await p.click(`.key[data-k="${k}"]`); await settle(p, 300); },
  stats: async p => { await p.click('.tab[data-tab="stats"]'); },
  assets: async p => { await p.click('.tab[data-tab="assets"]'); },
  me: async p => { await p.click('.tab[data-tab="me"]'); },
  budget: async p => { await p.click('[data-go="budget"]'); },
  detail: async p => { await p.click('#p-home .tx-main >> nth=0'); },
  search: async p => { await p.click('[data-go="search"]'); await settle(p, 700); await p.fill('#sq', '咖啡'); await p.press('#sq', 'Enter'); },
  calendar: async p => { await p.click('[data-go="calendar"]'); },
  account: async p => { await p.click('.tab[data-tab="assets"]'); await settle(p, 600); await p.click('#p-assets [data-go="acct"] >> nth=0'); },
  transfer: async p => { await p.click('.tab[data-tab="assets"]'); await settle(p, 600); await p.click('#p-assets [data-act="transfer"]'); },
  categories: async p => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="cats"]'); },
  recurring: async p => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="recurs"]'); },
  books: async p => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="books"]'); },
  settings: async p => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me .tool[data-go="settings"]'); },
  install: async p => { await p.click('.tab[data-tab="me"]'); await settle(p, 500); await p.click('#p-me [data-go="install"]'); },
};
// ---------- 原型导航（原型自带 ?ob=0&tab=&go= 录屏参数） ----------
const protoSteps = {
  home: '?ob=0', stats: '?ob=0&tab=stats', assets: '?ob=0&tab=assets', me: '?ob=0&tab=me', budget: '?ob=0&go=budget', search: '?ob=0&go=search', calendar: '?ob=0&go=calendar',
  categories: '?ob=0&go=cats', recurring: '?ob=0&go=recurs', books: '?ob=0&go=books', settings: '?ob=0&go=settings',
};
const protoClick = {
  record: async p => { await p.click('#fab'); await settle(p, 900); for (const k of ['3', '9', '.', '9']) await p.click(`.key[data-k="${k}"]`); await settle(p, 300); },
  detail: async p => { await p.click('#p-home .tx-main >> nth=0'); },
  search: async p => { await settle(p, 700); await p.fill('#sq', '咖啡'); await p.press('#sq', 'Enter'); },
  account: async p => { await p.click('#p-assets [data-go="acct"] >> nth=0'); },
  transfer: async p => { await p.click('#p-assets [data-act="transfer"]'); },
};
const protoQuery = { detail: '?ob=0', record: '?ob=0', account: '?ob=0&tab=assets', transfer: '?ob=0&tab=assets' };

async function pwaPage(scheme) {
  const c = await ctx(scheme); const p = await c.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(`[pwa ${scheme}] ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[pwa ${scheme}] ${e.message}`));
  await p.goto(PWA); await settle(p, 1200);
  await p.click('[data-ob="next"]'); await settle(p, 400); await p.click('[data-ob="next"]'); await settle(p, 500);
  await p.click('[data-ob="sample"]'); await settle(p, 800);
  if (await p.locator('[data-act="dismissInstall"]').count()) { await p.click('[data-act="dismissInstall"]'); await settle(p, 600); }
  if (await p.locator('[data-act="hideTip"]').count()) { /* 保留示例提示，与原型一致 */ }
  return { c, p };
}

async function shot(scheme, names) {
  const { c, p } = await pwaPage(scheme);
  for (const n of names) {
    await p.goto(PWA); await settle(p, 900);
    await pwaSteps[n](p); await settle(p);
    await p.screenshot({ path: `${OUT}${n}-${scheme}.png` });
  }
  // 引导页与锁屏
  if (scheme === 'light' || scheme === 'dark') {
    await p.goto(PWA); await settle(p, 800);
    await p.click('.tab[data-tab="me"]'); await settle(p, 400); await p.click('#p-me [data-act="onboard"]'); await settle(p, 1300);
    await p.screenshot({ path: `${OUT}onboarding-${scheme}.png` });
    await p.goto(PWA); await settle(p, 800);
    await p.click('.tab[data-tab="me"]'); await settle(p, 400); await p.click('#p-me .tool[data-go="settings"]'); await settle(p, 700);
    await p.click('[data-act="toggleLock"]'); await settle(p, 500);
    for (const k of '12341234') { await p.click(`#lock [data-n="${k}"]`); await p.waitForTimeout(260); }
    await settle(p, 900);
    await p.click('[data-act="lockNow"]'); await settle(p, 700);
    await p.click('#lock [data-n="1"]'); await p.click('#lock [data-n="2"]'); await settle(p, 300);
    await p.screenshot({ path: `${OUT}lock-${scheme}.png` });
    for (const k of '34') await p.click(`#lock [data-n="${k}"]`); await settle(p, 900);
    await p.click('[data-act="toggleLock"]'); await settle(p, 500); for (const k of '1234') { await p.click(`#lock [data-n="${k}"]`); await p.waitForTimeout(200); } await settle(p, 700);
  }
  await c.close();
}

async function protoShots(scheme, names) {
  const c = await ctx(scheme); const p = await c.newPage();
  for (const n of names) {
    const q = protoSteps[n] ?? protoQuery[n] ?? '?ob=0';
    await p.goto(PROTO + q); await settle(p, 900);
    if (protoClick[n]) { await protoClick[n](p); }
    await settle(p);
    await p.screenshot({ path: `/tmp/proto-${n}-${scheme}.png` });
  }
  await c.close();
}

async function compare(n, scheme) {
  const a = `/tmp/proto-${n}-${scheme}.png`, b = `${OUT}${n}-${scheme}.png`;
  if (!existsSync(a) || !existsSync(b)) return;
  const W = 780, H = 1688, gap = 40, top = 90;
  const bg = scheme === 'dark' ? '#111114' : '#E8E8E5', fg = scheme === 'dark' ? '#ddd' : '#333';
  const label = (t, x) => ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${top}"><text x="${W / 2}" y="58" font-size="34" text-anchor="middle" fill="${fg}" font-family="Noto Sans CJK SC, sans-serif">${t}</text></svg>`), left: x, top: 0 });
  await sharp({ create: { width: W * 2 + gap * 3, height: H + top + gap, channels: 3, background: bg } })
    .composite([label('原型', gap), label('正式版 PWA', W + gap * 2), { input: a, left: gap, top }, { input: b, left: W + gap * 2, top }])
    .png().toFile(`${CMP}${n}-${scheme}.png`);
}

const MAIN = ['home', 'record', 'stats', 'assets', 'me', 'budget', 'detail', 'search', 'calendar', 'account', 'transfer', 'categories', 'recurring', 'books', 'settings', 'install'];
const DARK = ['home', 'record', 'stats', 'assets', 'me', 'budget', 'calendar', 'settings'];
await shot('light', MAIN);
await shot('dark', DARK);
const CMP_NAMES = MAIN.filter(n => n !== 'install');
await protoShots('light', CMP_NAMES);
await protoShots('dark', DARK);
for (const n of CMP_NAMES) await compare(n, 'light');
for (const n of DARK) await compare(n, 'dark');
// 供 manifest 使用的应用截图
mkdirSync(new URL('../public/screenshots/', import.meta.url).pathname, { recursive: true });
for (const n of ['home', 'stats']) copyFileSync(`${OUT}${n}-light.png`, new URL(`../public/screenshots/${n}-light.png`, import.meta.url).pathname);
await browser.close();
console.log(errors.length ? 'console errors:\n' + errors.join('\n') : 'screenshots done, no console errors');
