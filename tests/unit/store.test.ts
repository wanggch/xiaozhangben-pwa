import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import * as store from '../../src/data/store';
import { DATA_MIGRATIONS, DATA_VERSION, openLedgerDB } from '../../src/data/db';

let n = 0; const fresh = () => `test-db-${++n}`;

describe('IndexedDB 持久化', () => {
  it('首次启动：空账本 + 默认分类与账户，并写入数据版本', async () => {
    const name = fresh();
    const r = await store.load(name);
    expect(r.fresh).toBe(true);
    expect(store.S.tx).toHaveLength(0);
    expect(store.S.accounts.map(a => a.name)).toEqual(['微信钱包', '支付宝', '现金']);
    expect(store.S.cats.expense.length).toBeGreaterThan(0);
    const db = await openLedgerDB(name);
    expect((await db.get('kv', 'dataVersion'))?.value).toBe(DATA_VERSION);
    expect(await db.count('accounts')).toBe(3);
    db.close();
  });

  it('修改后增量写入，重新加载可读回；删除同步删除', async () => {
    const name = fresh();
    await store.load(name);
    store.S.tx.push({ id: 't1', book: store.S.meta.curBook, type: 'expense', amount: 1990, cat: 'food', acct: 'a-wx', date: '2026-10-09', note: '午饭', ts: 1 } as any);
    store.S.meta.onboarded = true;
    store.save(); await store.flush();
    await store.load(name);
    expect(store.S.tx).toHaveLength(1);
    expect(store.S.tx[0].amount).toBe(1990);
    expect(store.S.meta.onboarded).toBe(true);
    store.S.tx = []; store.save(); await store.flush();
    const db = await openLedgerDB(name);
    expect(await db.count('tx')).toBe(0);
    db.close();
  });

  it('数据版本落后时按顺序执行迁移', async () => {
    const name = fresh();
    await store.load(name);
    store.S.meta.onboarded = true; store.save(); await store.flush();
    const db = await openLedgerDB(name);
    await db.put('kv', { key: 'dataVersion', value: DATA_VERSION - 1 });
    db.close();
    const calls: number[] = [];
    DATA_MIGRATIONS[DATA_VERSION] = raw => { calls.push(DATA_VERSION); raw.kv.meta.history = ['迁移过']; };
    try {
      await store.load(name);
      expect(calls).toEqual([DATA_VERSION]);
      expect(store.S.meta.history).toEqual(['迁移过']);
      const db2 = await openLedgerDB(name);
      expect((await db2.get('kv', 'dataVersion'))?.value).toBe(DATA_VERSION);
      db2.close();
    } finally { delete DATA_MIGRATIONS[DATA_VERSION]; }
  });
});
