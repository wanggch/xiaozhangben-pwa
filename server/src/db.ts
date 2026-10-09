/**
 * SQLite（better-sqlite3）：WAL 模式 + 按 user_version 递增的迁移
 * 新增迁移：在 MIGRATIONS 末尾追加一项，绝不修改已发布的迁移。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

export const MIGRATIONS: string[] = [
  // 1：账号、会话、同步记录、登录失败计数
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     pw_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0,
     seq INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,               -- sha256(token)，数据库里不保存原始令牌
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     user_agent TEXT,
     ip TEXT
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE records (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     id TEXT NOT NULL,
     data TEXT,                          -- JSON；软删除时为 NULL
     deleted INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL,        -- 服务端时间戳（毫秒），用于 last-write-wins
     seq INTEGER NOT NULL,               -- 每个用户单调递增的序列号，增量拉取的游标
     PRIMARY KEY (user_id, kind, id)
   ) WITHOUT ROWID;
   CREATE INDEX records_seq ON records(user_id, seq);
   CREATE TABLE login_failures (
     email TEXT PRIMARY KEY COLLATE NOCASE, -- 不论账号是否存在都计数，避免通过锁定行为枚举邮箱
     count INTEGER NOT NULL,
     locked_until INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   );`,
];

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): number {
  const cur = db.pragma('user_version', { simple: true }) as number;
  if (cur > MIGRATIONS.length) throw new Error(`数据库版本 ${cur} 高于程序支持的 ${MIGRATIONS.length}，请升级程序`);
  for (let v = cur; v < MIGRATIONS.length; v++) {
    db.transaction(() => { db.exec(MIGRATIONS[v]); db.pragma(`user_version = ${v + 1}`); })();
  }
  return MIGRATIONS.length;
}
