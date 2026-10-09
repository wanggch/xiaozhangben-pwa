/**
 * IndexedDB 结构与迁移
 * - DB_VERSION：IndexedDB 结构版本（新增 store / 索引时 +1，并在 upgrade 中按 oldVersion 逐级迁移）
 * - DATA_VERSION：数据格式版本（字段含义变化时 +1，在 DATA_MIGRATIONS 中写迁移函数）
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Account, Book, Recur, Tx } from '../core/types';

export const DB_NAME = 'xiaozhangben';
export const DB_VERSION = 1;
export const DATA_VERSION = 3; // 与 JSON 备份 v3 对齐（v2 = 原型 localStorage 格式，金额为元）

export interface LedgerDB extends DBSchema {
  tx: { key: string; value: Tx; indexes: { book: string; date: string } };
  accounts: { key: string; value: Account };
  books: { key: string; value: Book };
  recurs: { key: string; value: Recur };
  kv: { key: string; value: { key: string; value: unknown } };
}
export type DB = IDBPDatabase<LedgerDB>;
export const COLLECTIONS = ['tx', 'accounts', 'books', 'recurs'] as const;
export type Collection = typeof COLLECTIONS[number];

export function openLedgerDB(name = DB_NAME): Promise<DB> {
  return openDB<LedgerDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const tx = db.createObjectStore('tx', { keyPath: 'id' });
        tx.createIndex('book', 'book'); tx.createIndex('date', 'date');
        db.createObjectStore('accounts', { keyPath: 'id' });
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('recurs', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'key' });
      }
      // if (oldVersion < 2) { ...未来的结构迁移... }
    },
    blocked() { /* 旧标签页未关闭，等待即可 */ },
    blocking() { /* 新版本需要升级，交给 SW 更新提示刷新 */ },
  });
}

/** 数据格式迁移：key 为「迁移到的版本」，按顺序执行 */
export const DATA_MIGRATIONS: Record<number, (raw: { kv: Record<string, any>; tx: any[]; accounts: any[]; books: any[]; recurs: any[] }) => void> = {
  // 3: 正式版首个数据版本，无需迁移
};
export function migrateData(raw: Parameters<typeof DATA_MIGRATIONS[number]>[0], from: number) {
  for (let v = from + 1; v <= DATA_VERSION; v++) DATA_MIGRATIONS[v]?.(raw);
}
