import { describe, expect, it } from 'vitest';
import { emptyState } from '../../src/core/defaults';
import { balance, netWorth, totals, flowOf } from '../../src/core/ledger';
import { budgetAlert, budgetStatus, quickBudgets } from '../../src/core/budget';
import { applySamples, clearSamples } from '../../src/core/samples';
import type { Tx } from '../../src/core/types';

const tx = (o: Partial<Tx>): Tx => ({ id: Math.random().toString(36), book: 'b-daily', type: 'expense', cat: 'food', amount: 0, date: '2026-10-08', note: '', acct: null, toAcct: null, ts: 1, ...o });

describe('账户余额与转账', () => {
  it('余额 = 初始 + 收入 − 支出 ± 转账（跨账本）', () => {
    const S = emptyState();
    S.accounts.push({ id: 'cc', name: '信用卡', type: 'credit', init: -50000, order: 9 });
    S.accounts.find(a => a.id === 'a-wx')!.init = 10000;
    S.books.push({ id: 'b2', name: '旅行', budget: 0, catBudgets: {}, order: 1 });
    S.tx.push(tx({ acct: 'a-wx', amount: 1390 }), tx({ type: 'income', cat: 'salary', acct: 'a-wx', amount: 100000, book: 'b2' }),
      tx({ type: 'transfer', cat: null, acct: 'a-wx', toAcct: 'cc', amount: 30000 }));
    expect(balance(S, 'a-wx')).toBe(10000 - 1390 + 100000 - 30000);
    expect(balance(S, 'cc')).toBe(-20000);
    expect(flowOf(S, 'a-wx')).toBe(-1390 + 100000 - 30000);
    const nw = netWorth(S);
    expect(nw.as).toBe(78610); expect(nw.li).toBe(20000); expect(nw.net).toBe(58610);
    // 转账不计入收支
    const t = totals(S, '2026-10');
    expect(t.exp).toBe(1390); expect(t.inc).toBe(0);
  });
});

describe('预算', () => {
  it('进度、剩余、日均可用', () => {
    const b = budgetStatus(374439, 600000, 9, 31);
    expect(b.left).toBe(225561); expect(b.remainDays).toBe(23);
    expect(b.dailyAvail).toBe(Math.round(225561 / 23));
    expect(b.level).toBe('fast');
    expect(budgetStatus(100000, 600000, 15, 30).level).toBe('ok');
    expect(budgetStatus(500000, 600000, 15, 30).level).toBe('warn');
    expect(budgetStatus(700000, 600000, 15, 30).level).toBe('over');
    expect(budgetStatus(700000, 0, 15, 30).level).toBe('none');
  });
  it('记账后的提醒', () => {
    const base = { catName: '餐饮', catSpent: 0, cur: '¥' };
    expect(budgetAlert({ ...base, before: 590000, after: 610000, budget: 600000 })).toBe('已记录 · 本月已超支 ¥100.00');
    expect(budgetAlert({ ...base, before: 470000, after: 490000, budget: 600000 })).toBe('已记录 · 预算已用 82%');
    expect(budgetAlert({ ...base, before: 100000, after: 110000, budget: 600000, catBudget: 50000, catSpent: 60000 })).toBe('已记录 · 餐饮预算超出 ¥100.00');
    expect(budgetAlert({ ...base, before: 100000, after: 110000, budget: 600000 })).toBeNull();
  });
  it('快捷金额', () => { expect(quickBudgets(120000, 100000)).toEqual([1000, 1350, 200, 500]); });
});

describe('示例数据', () => {
  it('载入后余额与原型一致，可一键清除且不影响用户数据', () => {
    const S = emptyState();
    S.tx.push(tx({ id: 'mine', acct: 'a-wx', amount: 500 }));
    applySamples(S, '2026-10-09');
    expect(S.tx.filter(t => t.sample).length).toBeGreaterThan(100);
    expect(balance(S, 'a-cmb')).toBe(3842000);
    expect(balance(S, 'a-wx')).toBe(128640 - 500);
    expect(balance(S, 'a-cc')).toBe(-231680);
    expect(S.books.find(b => b.id === 'b-daily')!.budget).toBe(600000);
    expect(S.accounts.filter(a => a.id === 'a-wx').length).toBe(1);
    clearSamples(S);
    expect(S.tx.map(t => t.id)).toEqual(['mine']);
    expect(S.accounts.map(a => a.id).sort()).toEqual(['a-ali', 'a-cash', 'a-wx']);
    expect(balance(S, 'a-wx')).toBe(-500);
    expect(S.books.map(b => b.id)).toEqual(['b-daily']);
    expect(S.books[0].budget).toBe(0);
    expect(S.recurs).toEqual([]);
  });
  it('用户改过预算后清除示例不会重置预算', () => {
    const S = emptyState(); applySamples(S, '2026-10-09');
    const b = S.books[0]; b.budget = 300000; delete b.sampleBudget;
    clearSamples(S); expect(S.books[0].budget).toBe(300000);
  });
});
