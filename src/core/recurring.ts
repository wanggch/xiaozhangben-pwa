import type { Recur, State, Tx } from './types';
import { addDays, clampDom, parseD, WEEK } from './dates';
import { uid } from './id';

/** 计算下一次到期日。月/年按「每月 dom 日」推算，遇到小月自动落在月末（如 31 日 → 2 月 28/29 日） */
export function advance(r: Pick<Recur, 'freq' | 'dom' | 'start'>, from: string): string {
  const d = parseD(from);
  const dom = r.dom || parseD(r.start).getDate();
  if (r.freq === 'day') return addDays(from, 1);
  if (r.freq === 'week') return addDays(from, 7);
  if (r.freq === 'month') return clampDom(d.getFullYear(), d.getMonth() + 1, dom);
  return clampDom(d.getFullYear() + 1, d.getMonth(), dom);
}

export function freqText(r: Pick<Recur, 'freq' | 'dom' | 'start'>) {
  const s = parseD(r.start); const dom = r.dom || s.getDate();
  return r.freq === 'day' ? '每天' : r.freq === 'week' ? '每' + WEEK[s.getDay()] : r.freq === 'month' ? `每月 ${dom} 日` : `每年 ${s.getMonth() + 1}月${dom}日`;
}

export const txFromRule = (r: Recur, date: string): Tx => ({
  id: uid(), book: r.book, type: r.type, cat: r.cat, amount: r.amount, note: r.name, date, ts: Date.now(),
  acct: r.acct || null, toAcct: null, recurId: r.id, ...(r.sample ? { sample: true } : {}),
});

/** 生成所有已到期的「自动记账」账单，返回生成笔数 */
export function runRecurring(S: State, today: string): number {
  let n = 0;
  for (const r of S.recurs) {
    if (!r.on || r.mode !== 'auto') continue;
    let guard = 0;
    while (r.next <= today && guard++ < 400) { S.tx.push(txFromRule(r, r.next)); r.next = advance(r, r.next); n++; }
  }
  return n;
}
export const pendingRecurs = (S: State, today: string) => S.recurs.filter(r => r.on && r.mode === 'remind' && r.next <= today && r.book === S.meta.curBook);
