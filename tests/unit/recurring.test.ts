import { describe, expect, it } from 'vitest';
import { advance, freqText, pendingRecurs, runRecurring } from '../../src/core/recurring';
import { emptyState } from '../../src/core/defaults';
import type { Recur } from '../../src/core/types';

const rule = (o: Partial<Recur>): Recur => ({ id: 'r1', book: 'b-daily', name: '房租', type: 'expense', cat: 'house', amount: 280000, acct: 'a-wx', freq: 'month', dom: 1, start: '2026-01-01', next: '2026-01-01', mode: 'auto', on: true, ...o });

describe('周期规则日期推算', () => {
  it('每天 / 每周', () => {
    expect(advance(rule({ freq: 'day' }), '2026-12-31')).toBe('2027-01-01');
    expect(advance(rule({ freq: 'week' }), '2026-02-26')).toBe('2026-03-05');
  });
  it('每月：月末自动对齐，下个月恢复原日期', () => {
    const r = rule({ freq: 'month', dom: 31, start: '2026-01-31' });
    expect(advance(r, '2026-01-31')).toBe('2026-02-28');
    expect(advance(r, '2026-02-28')).toBe('2026-03-31');
    expect(advance(r, '2026-03-31')).toBe('2026-04-30');
    expect(advance(rule({ dom: 31 }), '2028-01-31')).toBe('2028-02-29'); // 闰年
    expect(advance(rule({ dom: 15 }), '2026-12-15')).toBe('2027-01-15');
  });
  it('每年：2 月 29 日在平年落到 28 日', () => {
    const r = rule({ freq: 'year', dom: 29, start: '2028-02-29' });
    expect(advance(r, '2028-02-29')).toBe('2029-02-28');
    expect(advance(r, '2031-02-28')).toBe('2032-02-29');
  });
  it('文案', () => {
    expect(freqText(rule({ freq: 'month', dom: 5 }))).toBe('每月 5 日');
    expect(freqText(rule({ freq: 'week', start: '2026-10-09' }))).toBe('每周五');
    expect(freqText(rule({ freq: 'year', start: '2026-03-08', dom: 8 }))).toBe('每年 3月8日');
  });
  it('自动记账补齐所有到期账单，提醒模式只提示', () => {
    const S = emptyState();
    S.recurs = [rule({ next: '2026-08-01' }), rule({ id: 'r2', mode: 'remind', next: '2026-10-09' }), rule({ id: 'r3', on: false, next: '2026-01-01' })];
    const n = runRecurring(S, '2026-10-09');
    expect(n).toBe(3); // 8/1 9/1 10/1
    expect(S.tx.map(t => t.date)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(S.tx.every(t => t.recurId === 'r1' && t.amount === 280000)).toBe(true);
    expect(S.recurs[0].next).toBe('2026-11-01');
    expect(pendingRecurs(S, '2026-10-09').map(r => r.id)).toEqual(['r2']);
    expect(runRecurring(S, '2026-10-09')).toBe(0);
  });
});
