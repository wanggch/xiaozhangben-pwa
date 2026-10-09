/** 账号、会话与登录失败锁定（数据访问层，只用参数化 SQL） */
import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './db.js';
import { hashPassword } from './password.js';

export interface User { id: number; email: string; pw_hash: string; is_admin: number; seq: number; created_at: number; updated_at: number }
export interface Session { id: string; user_id: number; created_at: number; last_seen: number; expires_at: number; user_agent: string | null; ip: string | null }

const DAY = 86_400_000;
export const normEmail = (e: string) => e.trim().toLowerCase();
export const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export class Accounts {
  constructor(private db: DB, private opts: { sessionDays: number; sessionMaxDays: number }) {}

  byEmail(email: string) { return this.db.prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) as User | undefined; }
  byId(id: number) { return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined; }
  list() { return this.db.prepare('SELECT u.id, u.email, u.is_admin, u.created_at, (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id AND r.deleted = 0) AS records, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions FROM users u ORDER BY u.id').all(Date.now()) as any[]; }
  count() { return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n; }

  async create(email: string, password: string, isAdmin = false): Promise<User> {
    const now = Date.now(); const h = await hashPassword(password);
    const info = this.db.prepare('INSERT INTO users (email, pw_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(normEmail(email), h, isAdmin ? 1 : 0, now, now);
    return this.byId(Number(info.lastInsertRowid))!;
  }
  async setPassword(userId: number, password: string) {
    const h = await hashPassword(password);
    this.db.prepare('UPDATE users SET pw_hash = ?, updated_at = ? WHERE id = ?').run(h, Date.now(), userId);
  }
  delete(userId: number) { return this.db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes > 0; }

  /* ---- 会话：随机 256 位令牌放在 HttpOnly Cookie，数据库只存其 SHA-256 ---- */
  createSession(userId: number, ua?: string, ip?: string) {
    const token = randomBytes(32).toString('base64url'); const now = Date.now();
    this.db.prepare('INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(tokenHash(token), userId, now, now, now + this.opts.sessionDays * DAY, (ua || '').slice(0, 200), ip || null);
    return { token, maxAge: this.opts.sessionDays * DAY / 1000 };
  }
  /** 校验会话；滑动续期（每天最多续一次，且不超过绝对上限） */
  validate(token: string | undefined): { user: User; session: Session; renewed: boolean } | null {
    if (!token || token.length > 100) return null;
    const s = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(tokenHash(token)) as Session | undefined;
    const now = Date.now();
    if (!s) return null;
    if (s.expires_at <= now) { this.db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id); return null; }
    const user = this.byId(s.user_id); if (!user) return null;
    let renewed = false;
    if (now - s.last_seen > DAY) {
      const exp = Math.min(now + this.opts.sessionDays * DAY, s.created_at + this.opts.sessionMaxDays * DAY);
      this.db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?').run(now, exp, s.id);
      s.last_seen = now; s.expires_at = exp; renewed = true;
    }
    return { user, session: s, renewed };
  }
  revoke(sessionId: string) { this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId); }
  revokeAll(userId: number, exceptSessionId?: string) {
    return this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptSessionId ?? '').changes;
  }
  sessions(userId: number) { return this.db.prepare('SELECT id, created_at, last_seen, expires_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC').all(userId, Date.now()) as Session[]; }
  purgeExpired() { return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()).changes; }

  /* ---- 登录失败锁定：按邮箱计数（无论账号是否存在），5 次起锁定 15 分钟，之后每次翻倍，最长 24 小时 ---- */
  lockedFor(email: string): number {
    const r = this.db.prepare('SELECT locked_until FROM login_failures WHERE email = ?').get(normEmail(email)) as { locked_until: number } | undefined;
    return r ? Math.max(0, r.locked_until - Date.now()) : 0;
  }
  recordFailure(email: string): number {
    const now = Date.now(); const e = normEmail(email).slice(0, 254);
    const r = this.db.prepare('SELECT count, updated_at FROM login_failures WHERE email = ?').get(e) as { count: number; updated_at: number } | undefined;
    // 24 小时内没有失败则重新计数
    const count = r && now - r.updated_at < DAY ? r.count + 1 : 1;
    const lockMs = count >= 5 ? Math.min(15 * 60_000 * 2 ** (count - 5), DAY) : 0;
    this.db.prepare('INSERT INTO login_failures (email, count, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until, updated_at = excluded.updated_at')
      .run(e, count, lockMs ? now + lockMs : 0, now);
    return lockMs;
  }
  clearFailures(email: string) { this.db.prepare('DELETE FROM login_failures WHERE email = ?').run(normEmail(email)); }
}
