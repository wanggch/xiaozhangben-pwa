/** Fastify 应用：安全头、CSRF（SameSite + Origin 校验）、登录门禁、账号与同步 API、静态文件 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { Accounts, tokenHash, type User, type Session } from './accounts.js';
import { Sync } from './sync.js';
import { burnPasswordTime, verifyPassword } from './password.js';
import { ChangePassword, Credentials, DeleteAccount, PullQuery, Push, Signup } from './schemas.js';
import { RateLimiter } from './ratelimit.js';

declare module 'fastify' {
  interface FastifyRequest { auth?: { user: User; session: Session } | null }
}

const httpError = (statusCode: number, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { statusCode, ...extra });

/** 无需登录即可访问的静态路径（登录页及其资源、图标、manifest、SW 脚本本身） */
const PUBLIC_STATIC = [/^\/login(\.html)?$/, /^\/pub\//, /^\/icons\//, /^\/favicon\.svg$/, /^\/manifest\.webmanifest$/, /^\/robots\.txt$/, /^\/sw\.js$/, /^\/workbox-[\w-]+\.js$/, /^\/screenshots\//];

export function buildApp(cfg: Config, db: DB, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: cfg.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
    trustProxy: cfg.trustProxy,
    bodyLimit: 64 * 1024,
  });
  const accounts = new Accounts(db, cfg);
  const sync = new Sync(db, cfg.maxRecordsPerUser);
  const authLimiter = new RateLimiter(cfg.authRateLimit, 10 * 60_000);   // 登录/注册：每 IP 10 分钟 N 次（默认 20）
  const apiLimiter = new RateLimiter(1200, 60_000);       // 其他 API：每 IP 每分钟 1200 次
  const COOKIE = cfg.cookieSecure ? '__Host-xzb_sid' : 'xzb_sid';
  app.decorate('limiters', { authLimiter, apiLimiter });

  /* ---------- 安全响应头 ---------- */
  const inlineHashes = new Set<string>();
  for (const f of ['index.html', 'login.html']) {
    const p = join(cfg.webRoot, f); if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) inlineHashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  const csp = [
    "default-src 'self'", `script-src 'self' ${[...inlineHashes].join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Content-Security-Policy', csp);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (cfg.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.register(fastifyCookie);

  const expectedOrigin = (req: FastifyRequest) => cfg.publicOrigin ?? `${req.protocol}://${req.host}`;
  const loadAuth = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.auth !== undefined) return req.auth;
    const v = accounts.validate(req.cookies[COOKIE]);
    req.auth = v ? { user: v.user, session: v.session } : null;
    if (v?.renewed) setCookie(reply, req.cookies[COOKIE]!, (v.session.expires_at - Date.now()) / 1000);
    return req.auth;
  };
  const setCookie = (reply: FastifyReply, token: string, maxAge: number) =>
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, secure: cfg.cookieSecure, sameSite: 'lax', maxAge: Math.floor(maxAge) });
  const clearCookie = (reply: FastifyReply) => reply.clearCookie(COOKIE, { path: '/', httpOnly: true, secure: cfg.cookieSecure, sameSite: 'lax' });

  /* ---------- 全局：CSRF、API 限流、登录门禁 ---------- */
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path.startsWith('/api/')) {
      const wait = apiLimiter.take(req.ip);
      if (wait) { reply.header('Retry-After', Math.ceil(wait / 1000)); throw httpError(429, '请求过于频繁'); }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        // CSRF：Cookie 是 SameSite=Lax；另外校验 Origin（缺失时退回 Sec-Fetch-Site），跨站写请求一律拒绝
        const origin = req.headers.origin;
        const ok = origin ? origin === expectedOrigin(req) : req.headers['sec-fetch-site'] === 'same-origin';
        if (!ok) throw httpError(403, '来源校验失败');
      }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    if (PUBLIC_STATIC.some(r => r.test(path))) return;
    // App 页面与脚本需要登录
    if (loadAuth(req, reply)) return;
    const wantsHtml = path === '/' || path.endsWith('.html') || (req.headers.accept || '').includes('text/html');
    if (wantsHtml) return reply.redirect('/login', 302);
    throw httpError(401, '未登录');
  });

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => { if (!loadAuth(req, reply)) throw httpError(401, '未登录'); };
  const parse = <T>(schema: ZodType<T>, v: unknown): T => {
    const r = schema.safeParse(v);
    if (!r.success) throw httpError(400, r.error.issues[0]?.message || '参数错误', { issues: r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    return r.data;
  };
  const limitAuth = (req: FastifyRequest, reply: FastifyReply) => {
    const wait = authLimiter.take(req.ip);
    if (wait) { reply.header('Retry-After', Math.ceil(wait / 1000)); throw httpError(429, `尝试过于频繁，请 ${Math.ceil(wait / 60000)} 分钟后再试`); }
  };
  const publicUser = (u: User) => ({ id: u.id, email: u.email, createdAt: u.created_at });

  app.setErrorHandler((err: any, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    const body: Record<string, unknown> = { error: status >= 500 ? '服务器错误' : err.message };
    if (err.issues) body.issues = err.issues;
    if (err.retryAfter) body.retryAfter = err.retryAfter;
    if (status === 415 || err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') body.error = '仅支持 JSON';
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') body.error = '请求体过大';
    reply.status(status).send(body);
  });

  /* ---------- 账号 ---------- */
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/auth/config', async () => ({ signup: cfg.allowSignup }));

  app.post('/api/auth/signup', { bodyLimit: 8 * 1024 }, async (req, reply) => {
    if (!cfg.allowSignup) throw httpError(403, '注册已关闭');
    limitAuth(req, reply);
    const { email, password } = parse(Signup, req.body);
    if (accounts.byEmail(email)) throw httpError(409, '该邮箱已注册');
    const user = await accounts.create(email, password);
    const s = accounts.createSession(user.id, req.headers['user-agent'], req.ip);
    setCookie(reply, s.token, s.maxAge);
    return reply.status(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', { bodyLimit: 8 * 1024 }, async (req, reply) => {
    limitAuth(req, reply);
    const { email, password } = parse(Credentials, req.body);
    const locked = accounts.lockedFor(email);
    if (locked) { reply.header('Retry-After', Math.ceil(locked / 1000)); throw httpError(429, `尝试次数过多，请 ${Math.ceil(locked / 60000)} 分钟后再试`, { retryAfter: Math.ceil(locked / 1000) }); }
    const user = accounts.byEmail(email);
    const ok = user ? await verifyPassword(password, user.pw_hash) : (await burnPasswordTime(password), false);
    if (!ok || !user) {
      const lock = accounts.recordFailure(email);
      if (lock) throw httpError(429, `尝试次数过多，请 ${Math.ceil(lock / 60000)} 分钟后再试`, { retryAfter: Math.ceil(lock / 1000) });
      throw httpError(401, '邮箱或密码错误');
    }
    accounts.clearFailures(email);
    const s = accounts.createSession(user.id, req.headers['user-agent'], req.ip);
    setCookie(reply, s.token, s.maxAge);
    req.log.info({ userId: user.id }, 'login');
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const t = req.cookies[COOKIE]; if (t) accounts.revoke(tokenHash(t));
    clearCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async req => ({ user: publicUser(req.auth!.user), sync: sync.stats(req.auth!.user.id) }));

  app.post('/api/auth/password', { bodyLimit: 8 * 1024, preHandler: requireAuth }, async (req, reply) => {
    limitAuth(req, reply);
    const { current, next } = parse(ChangePassword, req.body);
    const { user, session } = req.auth!;
    if (!(await verifyPassword(current, user.pw_hash))) throw httpError(400, '当前密码不正确');
    await accounts.setPassword(user.id, next);
    const revoked = accounts.revokeAll(user.id, session.id); // 改密码后其他设备全部下线
    return { ok: true, revoked };
  });

  app.get('/api/auth/sessions', { preHandler: requireAuth }, async req => ({
    sessions: accounts.sessions(req.auth!.user.id).map(s => ({ current: s.id === req.auth!.session.id, createdAt: s.created_at, lastSeen: s.last_seen, userAgent: s.user_agent })),
  }));
  app.post('/api/auth/sessions/revoke-others', { preHandler: requireAuth }, async req => ({ revoked: accounts.revokeAll(req.auth!.user.id, req.auth!.session.id) }));

  app.delete('/api/account', { bodyLimit: 8 * 1024, preHandler: requireAuth }, async (req, reply) => {
    limitAuth(req, reply);
    const { password } = parse(DeleteAccount, req.body);
    const { user } = req.auth!;
    if (!(await verifyPassword(password, user.pw_hash))) throw httpError(400, '密码不正确');
    accounts.delete(user.id); // 级联删除会话与全部云端记录
    clearCookie(reply);
    req.log.info({ userId: user.id }, 'account deleted');
    return { ok: true };
  });

  /* ---------- 同步 ---------- */
  app.get('/api/sync/pull', { preHandler: requireAuth }, async req => {
    const q = parse(PullQuery, req.query);
    return sync.pull(req.auth!.user.id, q.since, q.limit);
  });
  app.post('/api/sync/push', { bodyLimit: 8 * 1024 * 1024, preHandler: requireAuth }, async req => {
    const { changes } = parse(Push, req.body);
    return sync.push(req.auth!.user.id, changes as any);
  });

  app.all('/api/*', async () => { throw httpError(404, '接口不存在'); });

  /* ---------- 静态文件（前端构建产物） ---------- */
  if (existsSync(cfg.webRoot)) {
    app.register(fastifyStatic, {
      root: cfg.webRoot, wildcard: true, index: ['index.html'], decorateReply: true, cacheControl: false, etag: true, lastModified: true,
      setHeaders(res, path) {
        const p = path.replace(/\\/g, '/');
        if (/\/(assets|pub)\/.+-[\w-]{8,}\.\w+$/.test(p)) res.header('Cache-Control', `${p.includes('/pub/') ? 'public' : 'private'}, max-age=31536000, immutable`);
        else if (/\.(html|webmanifest)$|\/sw\.js$/.test(p)) res.header('Cache-Control', 'no-cache');
        else res.header('Cache-Control', 'public, max-age=3600');
      },
    });
    app.get('/login', async (req, reply) => {
      if (loadAuth(req, reply)) return reply.redirect('/', 302);
      return reply.header('Cache-Control', 'no-cache').sendFile('login.html');
    });
  }
  app.setNotFoundHandler((req, reply) => { reply.status(404).send(req.url.startsWith('/api/') ? { error: '接口不存在' } : '404 Not Found'); });

  // 每小时清理过期会话
  const timer = setInterval(() => accounts.purgeExpired(), 3600_000); timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
  return app;
}
