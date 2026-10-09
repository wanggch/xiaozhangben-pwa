import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { Accounts } from '../src/accounts.js';

export const ORIGIN = 'https://ledger.test';
export const INLINE = "document.documentElement.dataset.t='x'";

export function webRoot() {
  const d = mkdtempSync(join(tmpdir(), 'xzb-web-'));
  mkdirSync(join(d, 'assets')); mkdirSync(join(d, 'pub')); mkdirSync(join(d, 'icons'));
  writeFileSync(join(d, 'index.html'), `<!doctype html><title>app</title><script>${INLINE}</script><script type="module" src="/assets/index-abcdef12.js"></script>`);
  writeFileSync(join(d, 'login.html'), '<!doctype html><title>login</title><script type="module" src="/pub/login-abcdef12.js"></script>');
  writeFileSync(join(d, 'assets', 'index-abcdef12.js'), 'console.log("app")');
  writeFileSync(join(d, 'pub', 'login-abcdef12.js'), 'console.log("login")');
  writeFileSync(join(d, 'icons', 'icon-192.png'), 'png');
  writeFileSync(join(d, 'manifest.webmanifest'), '{}');
  writeFileSync(join(d, 'sw.js'), '// sw');
  return d;
}

export async function setup(env: Record<string, string> = {}) {
  const cfg = loadConfig({ PUBLIC_ORIGIN: ORIGIN, DB_PATH: ':memory:', WEB_ROOT: webRoot(), ...env });
  const db = openDb(':memory:');
  const app = buildApp(cfg, db, { logger: false });
  await app.ready();
  const accounts = new Accounts(db, cfg);
  const cookieName = cfg.cookieSecure ? '__Host-xzb_sid' : 'xzb_sid';

  const post = (url: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, payload: body as any, headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers } });
  const get = (url: string, cookie?: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers: { ...(cookie ? { cookie } : {}), ...headers } });
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => { const c = res.cookies.find(c => c.name === cookieName); return c ? `${cookieName}=${c.value}` : ''; };
  async function login(email: string, password: string) {
    const r = await post('/api/auth/login', { email, password });
    if (r.statusCode !== 200) throw new Error(`login ${r.statusCode} ${r.body}`);
    return cookieOf(r);
  }
  async function user(email: string, password = 'correct horse battery') { await accounts.create(email, password); return login(email, password); }
  return { app, db, cfg, accounts, post, get, login, user, cookieOf, cookieName };
}

export const tx = (id: string, amount = 1234, extra: Record<string, unknown> = {}) => ({ id, book: 'b-daily', type: 'expense', amount, date: '2026-10-09', cat: 'food', acct: 'a-wx', toAcct: null, note: '', ts: 1, ...extra });
