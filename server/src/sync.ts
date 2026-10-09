/** 云同步：按用户隔离；服务端单调序列号增量拉取；记录级 last-write-wins（以服务端接收时间为准）；软删除 */
import type { DB } from './db.js';
import { validateData, type Kind } from './schemas.js';

export interface ChangeIn { kind: Kind; id: string; deleted: boolean; data?: unknown }
export interface ChangeOut { kind: Kind; id: string; deleted: boolean; data: unknown; updatedAt: number; seq: number }

export class Sync {
  constructor(private db: DB, private maxRecords: number) {}

  pull(userId: number, since: number, limit: number) {
    const rows = this.db.prepare('SELECT kind, id, data, deleted, updated_at, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(userId, since, limit + 1) as any[];
    const more = rows.length > limit; if (more) rows.pop();
    const changes: ChangeOut[] = rows.map(r => ({ kind: r.kind, id: r.id, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : null, updatedAt: r.updated_at, seq: r.seq }));
    const head = this.head(userId);
    return { changes, cursor: changes.length ? changes[changes.length - 1].seq : Math.min(since, head), head, hasMore: more };
  }

  head(userId: number) { return (this.db.prepare('SELECT seq FROM users WHERE id = ?').get(userId) as { seq: number } | undefined)?.seq ?? 0; }
  stats(userId: number) {
    const r = this.db.prepare('SELECT COUNT(*) AS n, SUM(deleted = 0) AS live FROM records WHERE user_id = ?').get(userId) as { n: number; live: number | null };
    return { head: this.head(userId), records: r.live ?? 0, tombstones: r.n - (r.live ?? 0) };
  }

  /** 推送一批变更；整批在一个事务里，任何一条校验失败则整批拒绝 */
  push(userId: number, changes: ChangeIn[]) {
    const prepared = changes.map((c, i) => {
      if (c.deleted) return { ...c, json: null as string | null };
      const v = validateData(c.kind, c.id, c.data);
      if (!v.ok) throw Object.assign(new Error(`第 ${i + 1} 条（${c.kind}/${c.id}）：${v.error}`), { statusCode: 400 });
      return { ...c, json: v.json };
    });
    const get = this.db.prepare('SELECT data, deleted, updated_at, seq FROM records WHERE user_id = ? AND kind = ? AND id = ?');
    const bump = this.db.prepare('UPDATE users SET seq = seq + 1 WHERE id = ? RETURNING seq');
    const upsert = this.db.prepare(`INSERT INTO records (user_id, kind, id, data, deleted, updated_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, seq = excluded.seq`);
    const live = this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE user_id = ? AND deleted = 0');
    return this.db.transaction(() => {
      const results: { kind: Kind; id: string; seq: number; updatedAt: number; unchanged?: boolean }[] = [];
      let added = 0;
      for (const c of prepared) {
        const prev = get.get(userId, c.kind, c.id) as { data: string | null; deleted: number; updated_at: number; seq: number } | undefined;
        if (prev && !!prev.deleted === c.deleted && prev.data === c.json) { results.push({ kind: c.kind, id: c.id, seq: prev.seq, updatedAt: prev.updated_at, unchanged: true }); continue; }
        if (!prev && c.deleted) { results.push({ kind: c.kind, id: c.id, seq: 0, updatedAt: 0, unchanged: true }); continue; } // 删除云端不存在的记录：无需墓碑
        if (!c.deleted && (!prev || prev.deleted)) added++;
        // 服务端时间戳单调不减，保证同一记录后到的写入一定「更新」
        const now = Math.max(Date.now(), (prev?.updated_at ?? 0) + 1);
        const seq = (bump.get(userId) as { seq: number }).seq;
        upsert.run(userId, c.kind, c.id, c.json, c.deleted ? 1 : 0, now, seq);
        results.push({ kind: c.kind, id: c.id, seq, updatedAt: now });
      }
      if (added && (live.get(userId) as { n: number }).n > this.maxRecords) throw Object.assign(new Error('云端记录数已达上限'), { statusCode: 413 });
      return { results, head: this.head(userId) };
    })();
  }
}
