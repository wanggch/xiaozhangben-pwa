import { describe, it, expect } from 'vitest';
import { emptyState, defaultBook } from '../../src/core/defaults';
import { toRecords, applyRemote, repairState, hasUserData } from '../../src/sync/records';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('同步记录映射', () => {
  it('应用锁 PIN 不进入同步记录', () => {
    const S = emptyState();
    S.settings.lock = true; S.settings.pin = 'salt$hash' as any;
    const rec = toRecords(S).get('settings:settings')!;
    expect(rec.data).not.toHaveProperty('pin');
    expect(rec.data).not.toHaveProperty('lock');
  });

  it('toRecords → applyRemote 往返可还原状态（含分类排序）', () => {
    const A = emptyState();
    A.tx.push({ id: 't1', type: 'expense', amount: 1234, cat: A.cats.expense[0].id, acct: A.accounts[0].id, book: A.books[0].id, date: '2026-10-09', note: 'x' } as any);
    A.cats.expense.reverse();
    const B = emptyState(); B.cats = { expense: [], income: [] }; B.accounts = []; B.books = [];
    let seq = 0;
    for (const r of toRecords(A).values()) applyRemote(B, { kind: r.kind, id: r.id, deleted: false, data: clone(r.data), updatedAt: 1, seq: ++seq });
    expect(B.tx).toEqual(A.tx);
    expect(B.cats.expense.map(c => c.id)).toEqual(A.cats.expense.map(c => c.id));
    expect(B.accounts).toEqual(A.accounts);
  });

  it('远端墓碑删除本地记录；远端设置不会覆盖本机 PIN', () => {
    const S = emptyState();
    S.tx.push({ id: 't1' } as any);
    S.settings.pin = 'local' as any;
    applyRemote(S, { kind: 'tx', id: 't1', deleted: true, data: null, updatedAt: 2, seq: 2 });
    applyRemote(S, { kind: 'settings', id: 'settings', deleted: false, data: { theme: 'dark', pin: 'evil', lock: true }, updatedAt: 3, seq: 3 });
    expect(S.tx).toHaveLength(0);
    expect(S.settings.theme).toBe('dark');
    expect(S.settings.pin).toBe('local');
  });

  it('repairState 保证至少有一个账本；hasUserData 区分默认数据', () => {
    const S = emptyState(); S.books = []; S.meta.curBook = 'gone' as any;
    repairState(S, defaultBook);
    expect(S.books).toHaveLength(1);
    expect(S.meta.curBook).toBe(S.books[0].id);
    expect(hasUserData(emptyState(), emptyState())).toBe(false);
    const U = emptyState(); U.accounts[0].name = '工资卡';
    expect(hasUserData(U, emptyState())).toBe(true);
  });
});
