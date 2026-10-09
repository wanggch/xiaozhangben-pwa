import type { Cents } from './types';

/** 把用户输入/导入的金额字符串解析为分（不经过浮点乘法） */
export function parseCents(input: string | number | null | undefined): Cents {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') {
    if (!isFinite(input)) return 0;
    return Math.round(input * 100 + (input >= 0 ? 1e-7 : -1e-7));
  }
  let s = String(input).trim().replace(/[,，\s¥$€£₩]/g, '');
  if (!s) return 0;
  let neg = false;
  if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  const m = s.match(/^(\d*)(?:\.(\d*))?/);
  if (!m || (!m[1] && !m[2])) return 0;
  const intPart = m[1] ? parseInt(m[1], 10) : 0;
  const frac = (m[2] || '');
  let cents = intPart * 100 + parseInt((frac + '00').slice(0, 2), 10);
  if (frac.length > 2 && parseInt(frac[2], 10) >= 5) cents += 1; // 四舍五入到分
  return neg ? -cents : cents;
}

/** 分 → 带千分位的两位小数（不含符号） */
export function fmt2(c: Cents): string {
  const a = Math.abs(Math.round(c));
  const i = Math.floor(a / 100), d = a % 100;
  return i.toLocaleString('en-US') + '.' + String(d).padStart(2, '0');
}

/** 分 → 不带千分位的纯数字字符串（导出用），如 1234.5 元 → "1234.50" */
export function plain(c: Cents): string {
  const neg = c < 0; const a = Math.abs(Math.round(c));
  return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}

export function money(c: Cents, cur: string): string {
  return (c < 0 ? '-' : '') + cur + fmt2(c);
}

/** 简写：1.2万 / 3.4k / 56 */
export function short(c: Cents): string {
  const n = c / 100;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n) + '';
}

export const sumAmt = (arr: { amount: Cents }[]): Cents => arr.reduce((a, t) => a + t.amount, 0);

/** 分转元（仅用于显示计算，如百分比） */
export const yuan = (c: Cents) => c / 100;
