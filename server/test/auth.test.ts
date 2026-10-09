import { describe, it, expect } from 'vitest';
import { setup, ORIGIN, INLINE } from './helpers.js';
import { createHash } from 'node:crypto';
import { migrate, openDb } from '../src/db.js';
import { hashPassword, verifyPassword } from '../src/password.js';

describe('数据库与密码', () => {
  it('WAL 模式，迁移可重复执行', () => {
    const db = openDb(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(migrate(db)).toBe(1);
  });
  it('scrypt 哈希：随机盐，不含明文，可校验', async () => {
    const a = await hashPassword('p@ssw0rd!'), b = await hashPassword('p@ssw0rd!');
    expect(a).not.toBe(b); expect(a).not.toContain('p@ssw0rd');
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('p@ssw0rd!', a)).toBe(true);
    expect(await verifyPassword('p@ssw0rd?', a)).toBe(false);
  });
});

describe('注册与登录', () => {
  it('默认关闭注册', async () => {
    const t = await setup();
    expect((await t.get('/api/auth/config')).json()).toEqual({ signup: false });
    const r = await t.post('/api/auth/signup', { email: 'a@x.com', password: '12345678' });
    expect(r.statusCode).toBe(403);
    expect(t.accounts.count()).toBe(0);
  });
  it('ALLOW_SIGNUP=true 时可注册，重复邮箱 409，弱密码 400', async () => {
    const t = await setup({ ALLOW_SIGNUP: 'true' });
    expect((await t.post('/api/auth/signup', { email: 'A@X.com', password: 'short' })).statusCode).toBe(400);
    const r = await t.post('/api/auth/signup', { email: 'A@X.com', password: 'long enough pw' });
    expect(r.statusCode).toBe(201); expect(r.json().user.email).toBe('a@x.com');
    expect((await t.post('/api/auth/signup', { email: 'a@x.com', password: 'long enough pw' })).statusCode).toBe(409);
  });
  it('登录成功：HttpOnly + Secure + SameSite=Lax 的 __Host- Cookie；数据库只存令牌哈希', async () => {
    const t = await setup();
    await t.accounts.create('me@x.com', 'correct horse battery');
    const r = await t.post('/api/auth/login', { email: ' ME@x.com ', password: 'correct horse battery' });
    expect(r.statusCode).toBe(200);
    const c = r.cookies.find(c => c.name === '__Host-xzb_sid')!;
    expect(c.httpOnly).toBe(true); expect(c.secure).toBe(true); expect(c.sameSite).toBe('Lax'); expect(c.path).toBe('/');
    const row = t.db.prepare('SELECT id FROM sessions').get() as { id: string };
    expect(row.id).toBe(createHash('sha256').update(c.value).digest('hex'));
    const me = await t.get('/api/auth/me', `__Host-xzb_sid=${c.value}`);
    expect(me.statusCode).toBe(200); expect(me.json().user.email).toBe('me@x.com');
  });
  it('错误密码与不存在的邮箱返回同样的错误', async () => {
    const t = await setup();
    await t.accounts.create('me@x.com', 'correct horse battery');
    const a = await t.post('/api/auth/login', { email: 'me@x.com', password: 'wrong' });
    const b = await t.post('/api/auth/login', { email: 'nobody@x.com', password: 'wrong' });
    expect(a.statusCode).toBe(401); expect(b.statusCode).toBe(401); expect(a.json()).toEqual(b.json());
  });
  it('连续失败 5 次锁定（正确密码也拒绝）；不存在的邮箱同样锁定；CLI 解锁后恢复', async () => {
    const t = await setup();
    await t.accounts.create('me@x.com', 'correct horse battery');
    for (let i = 0; i < 4; i++) expect((await t.post('/api/auth/login', { email: 'me@x.com', password: 'bad' })).statusCode).toBe(401);
    const fifth = await t.post('/api/auth/login', { email: 'me@x.com', password: 'bad' });
    expect(fifth.statusCode).toBe(429); expect(fifth.json().retryAfter).toBeGreaterThan(800);
    expect((await t.post('/api/auth/login', { email: 'me@x.com', password: 'correct horse battery' })).statusCode).toBe(429);
    for (let i = 0; i < 5; i++) await t.post('/api/auth/login', { email: 'ghost@x.com', password: 'bad' }, undefined, { 'x-forwarded-for': '9.9.9.9' });
    expect((await t.post('/api/auth/login', { email: 'ghost@x.com', password: 'bad' })).statusCode).toBe(429);
    t.accounts.clearFailures('me@x.com');
    expect((await t.post('/api/auth/login', { email: 'me@x.com', password: 'correct horse battery' })).statusCode).toBe(200);
  });
  it('同一 IP 10 分钟内超过 20 次登录请求被限流', async () => {
    const t = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await t.post('/api/auth/login', { email: `u${i}@x.com`, password: 'bad' })).statusCode);
    expect(codes.slice(0, 20).every(c => c === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe('会话吊销', () => {
  it('退出登录后旧 Cookie 失效', async () => {
    const t = await setup();
    const c = await t.user('me@x.com');
    expect((await t.post('/api/auth/logout', {}, c)).statusCode).toBe(200);
    expect((await t.get('/api/auth/me', c)).statusCode).toBe(401);
  });
  it('修改密码：其他设备下线，当前设备保留；旧密码失效', async () => {
    const t = await setup();
    const a = await t.user('me@x.com', 'old password 1');
    const b = await t.login('me@x.com', 'old password 1');
    expect((await t.post('/api/auth/password', { current: 'wrong', next: 'new password 2' }, a)).statusCode).toBe(400);
    const r = await t.post('/api/auth/password', { current: 'old password 1', next: 'new password 2' }, a);
    expect(r.json()).toEqual({ ok: true, revoked: 1 });
    expect((await t.get('/api/auth/me', a)).statusCode).toBe(200);
    expect((await t.get('/api/auth/me', b)).statusCode).toBe(401);
    expect((await t.post('/api/auth/login', { email: 'me@x.com', password: 'old password 1' })).statusCode).toBe(401);
    await t.login('me@x.com', 'new password 2');
  });
  it('退出其他设备 / 服务器端 CLI 吊销全部会话', async () => {
    const t = await setup();
    const a = await t.user('me@x.com'); const b = await t.login('me@x.com', 'correct horse battery');
    expect((await t.get('/api/auth/sessions', a)).json().sessions).toHaveLength(2);
    expect((await t.post('/api/auth/sessions/revoke-others', {}, a)).json().revoked).toBe(1);
    expect((await t.get('/api/auth/me', b)).statusCode).toBe(401);
    t.accounts.revokeAll(t.accounts.byEmail('me@x.com')!.id);
    expect((await t.get('/api/auth/me', a)).statusCode).toBe(401);
  });
  it('过期会话被拒绝', async () => {
    const t = await setup();
    const a = await t.user('me@x.com');
    t.db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
    expect((await t.get('/api/auth/me', a)).statusCode).toBe(401);
  });
});

describe('CSRF、输入校验与请求体大小', () => {
  it('写请求缺少或伪造 Origin 被拒绝', async () => {
    const t = await setup();
    const a = await t.user('me@x.com');
    const noOrigin = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: a, 'content-type': 'application/json' }, payload: '{}' });
    expect(noOrigin.statusCode).toBe(403);
    expect((await t.post('/api/auth/logout', {}, a, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await t.get('/api/auth/me', a)).statusCode).toBe(200);
    const sameSite = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: a, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, payload: '{}' });
    expect(sameSite.statusCode).toBe(200);
  });
  it('非 JSON（表单提交）被拒绝；多余字段被拒绝；请求体过大 413', async () => {
    const t = await setup();
    const form = await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, payload: 'email=a@x.com&password=x' });
    expect(form.statusCode).toBe(415);
    expect((await t.post('/api/auth/login', { email: 'a@x.com', password: 'x', admin: true })).statusCode).toBe(400);
    expect((await t.post('/api/auth/login', { email: 'not-an-email', password: 'x' })).statusCode).toBe(400);
    expect((await t.post('/api/auth/login', { email: 'a@x.com', password: 'x'.repeat(9000) })).statusCode).toBe(413);
  });
});

describe('登录门禁与安全响应头', () => {
  it('未登录：页面跳转登录、脚本 401、API 401；登录页与图标、manifest 公开', async () => {
    const t = await setup();
    const home = await t.get('/', undefined, { accept: 'text/html' });
    expect(home.statusCode).toBe(302); expect(home.headers.location).toBe('/login');
    expect((await t.get('/index.html')).statusCode).toBe(302);
    expect((await t.get('/assets/index-abcdef12.js')).statusCode).toBe(401);
    expect((await t.get('/api/sync/pull')).statusCode).toBe(401);
    for (const u of ['/login', '/pub/login-abcdef12.js', '/icons/icon-192.png', '/manifest.webmanifest', '/sw.js']) expect((await t.get(u)).statusCode, u).toBe(200);
  });
  it('已登录：可访问 App；访问登录页会跳回首页', async () => {
    const t = await setup();
    const a = await t.user('me@x.com');
    const home = await t.get('/', a);
    expect(home.statusCode).toBe(200); expect(home.body).toContain('<title>app</title>');
    expect((await t.get('/assets/index-abcdef12.js', a)).headers['cache-control']).toContain('private');
    expect((await t.get('/login', a)).headers.location).toBe('/');
  });
  it('安全响应头：CSP（含内联脚本哈希）、HSTS、nosniff、禁止嵌入；API 不缓存', async () => {
    const t = await setup();
    const r = await t.get('/login');
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'"); expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(`'sha256-${createHash('sha256').update(INLINE).digest('base64')}'`);
    expect(csp).not.toContain('unsafe-eval');
    expect(r.headers['strict-transport-security']).toContain('max-age=');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect((await t.get('/api/health')).headers['cache-control']).toBe('no-store');
  });
});

describe('注销账号', () => {
  it('需要密码；删除账号、会话与全部云端数据', async () => {
    const t = await setup();
    const a = await t.user('me@x.com');
    await t.post('/api/sync/push', { changes: [{ kind: 'tx', id: 't1', deleted: false, data: { id: 't1', book: 'b', type: 'expense', amount: 1, date: '2026-10-09' } }] }, a);
    const del = (body: unknown) => t.app.inject({ method: 'DELETE', url: '/api/account', payload: body as any, headers: { origin: ORIGIN, cookie: a, 'content-type': 'application/json' } });
    expect((await del({ password: 'nope' })).statusCode).toBe(400);
    expect((await del({ password: 'correct horse battery' })).statusCode).toBe(200);
    expect(t.accounts.count()).toBe(0);
    expect((t.db.prepare('SELECT COUNT(*) n FROM records').get() as any).n).toBe(0);
    expect((t.db.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n).toBe(0);
    expect((await t.get('/api/auth/me', a)).statusCode).toBe(401);
  });
});
