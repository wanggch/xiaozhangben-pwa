import type { Tx } from './types';
import { addDays, daysIn, md, pad, parseD, ymAdd, ymLabel } from './dates';

export type Period = 'week' | 'month' | 'year';
export interface Unit { key: string; label: string; match: (t: Tx) => boolean }
export interface Range { start: string; end: string; label: string; units: Unit[] }

export function periodRange(p: Period, anchor: string, weekStart: number): Range {
  if (p === 'week') {
    const diff = (parseD(anchor).getDay() - weekStart + 7) % 7; const s = addDays(anchor, -diff), e = addDays(s, 6);
    return { start: s, end: e, label: `${md(s)} – ${md(e)}`, units: Array.from({ length: 7 }, (_, i) => { const k = addDays(s, i); return { key: k, label: '日一二三四五六'[parseD(k).getDay()], match: (t: Tx) => t.date === k }; }) };
  }
  if (p === 'month') {
    const ym = anchor.slice(0, 7), n = daysIn(ym);
    return { start: ym + '-01', end: `${ym}-${pad(n)}`, label: ymLabel(ym), units: Array.from({ length: n }, (_, i) => { const k = `${ym}-${pad(i + 1)}`; return { key: k, label: String(i + 1), match: (t: Tx) => t.date === k }; }) };
  }
  const y = anchor.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}年`, units: Array.from({ length: 12 }, (_, i) => { const k = `${y}-${pad(i + 1)}`; return { key: k, label: (i + 1) + '月', match: (t: Tx) => t.date.startsWith(k) }; }) };
}
export function shiftAnchor(p: Period, a: string, k: number) {
  if (p === 'week') return addDays(a, 7 * k);
  if (p === 'month') return ymAdd(a.slice(0, 7), k) + '-01';
  return `${+a.slice(0, 4) + k}-01-01`;
}
export const inRange = (t: Tx, r: Range) => t.date >= r.start && t.date <= r.end;
export function niceMax(v: number) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
