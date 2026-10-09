/**
 * 记一笔数字键盘的算式逻辑（纯函数，便于单元测试）
 * - 支持加减连算，每一项最多 8 位整数、2 位小数
 * - 按「=」得到结果后统一显示两位小数（39.9 → 39.90），继续按键可接着编辑
 */
import type { Cents } from './types';
import { fmt2, parseCents } from './money';

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '-' | 'back' | 'ok' | 'again';
export interface ExprState { expr: string; evald: boolean }
export type ExprAction = 'bump' | 'commit' | 'commitAgain' | null;

export const hasOp = (s: string) => /[+\-]/.test(s.slice(1));

export function evalExpr(s: string): Cents {
  const m = s.match(/[+\-]?[\d.]+/g) || [];
  return m.reduce((a, x) => a + parseCents(x), 0);
}

/** 分 → 算式中的数字字符串，去掉多余的 0：3990 → "39.9"，4000 → "40" */
export function centsToExpr(c: Cents): string {
  const a = Math.abs(c); const i = Math.floor(a / 100), d = a % 100;
  const s = d === 0 ? String(i) : d % 10 === 0 ? `${i}.${d / 10}` : `${i}.${String(d).padStart(2, '0')}`;
  return (c < 0 ? '-' : '') + s;
}

export function press(st: ExprState, k: Key): { state: ExprState; action: ExprAction } {
  let s = st.expr;
  const last = () => s.split(/[+\-]/).pop() || '';
  if (/^\d$/.test(k)) {
    const l = last();
    if ((l.includes('.') && l.split('.')[1].length >= 2) || l.replace('.', '').length >= 8) return { state: st, action: 'bump' };
    if (l === '0') s = s.slice(0, -1);
    s += k;
  } else if (k === '.') {
    const l = last();
    if (l.includes('.')) return { state: st, action: null };
    s += l === '' ? '0.' : '.';
  } else if (k === '+' || k === '-') {
    if (!s) return { state: st, action: null };
    if (/[+\-.]$/.test(s)) s = s.slice(0, -1);
    if (!s) return { state: st, action: null };
    s += k;
  } else if (k === 'back') {
    s = s.slice(0, -1);
  } else if (k === 'ok') {
    if (hasOp(s)) { const v = evalExpr(s); s = v > 0 ? centsToExpr(v) : ''; }
    else return { state: st, action: 'commit' };
  } else if (k === 'again') {
    return { state: st, action: 'commitAgain' };
  }
  return { state: { expr: s, evald: k === 'ok' && !!s }, action: null };
}

/** 大号金额的显示文本 */
export function displayValue(st: ExprState): string {
  if (st.expr && !hasOp(st.expr) && !st.evald) return st.expr;
  return fmt2(st.expr ? evalExpr(st.expr) : 0);
}

/** 金额上方的小字算式 */
export function exprLine(st: ExprState): string {
  return hasOp(st.expr) ? st.expr.replace(/-/g, ' − ').replace(/\+/g, ' + ') + ' =' : '';
}
