import type { Cents } from './types';
import { money } from './money';

export interface BudgetStatus { pct: number; left: Cents; remainDays: number; elapsed: number; dailyAvail: Cents; level: 'none' | 'ok' | 'fast' | 'warn' | 'over' }

/** 预算进度：today 为本月第几天，dim 为本月天数 */
export function budgetStatus(exp: Cents, budget: Cents, dayOfMonth: number, dim: number): BudgetStatus {
  const pct = budget ? exp / budget : 0; const left = budget - exp;
  const remainDays = dim - dayOfMonth + 1, elapsed = dayOfMonth / dim;
  const dailyAvail = left > 0 ? Math.floor(left / remainDays) : 0;
  const level = !budget ? 'none' : pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : pct <= elapsed ? 'ok' : 'fast';
  return { pct, left, remainDays, elapsed, dailyAvail, level };
}
export const budgetColor = (pct: number) => pct > 1 ? 'var(--danger)' : pct >= 0.8 ? 'var(--warn)' : 'var(--accent)';

/** 记一笔后的预算提醒文案（null = 无需提醒） */
export function budgetAlert(o: { before: Cents; after: Cents; budget: Cents; catName: string; catBudget?: Cents; catSpent: Cents; cur: string }): string | null {
  const { before, after, budget: B, catBudget: cb, catSpent: cs, cur } = o;
  if (B && after > B) return `已记录 · 本月已超支 ${money(after - B, cur)}`;
  if (B && before < B * 0.8 && after >= B * 0.8) return `已记录 · 预算已用 ${(after / B * 100).toFixed(0)}%`;
  if (cb && cs > cb) return `已记录 · ${o.catName}预算超出 ${money(cs - cb, cur)}`;
  return null;
}

/** 分类预算快捷金额建议（元） */
export function quickBudgets(lastMonth: Cents, avg3: Cents): number[] {
  return [...new Set([Math.ceil(avg3 / 100 / 50) * 50, Math.ceil(lastMonth / 100 * 1.1 / 50) * 50, 200, 500, 1000].filter(v => v > 0))].slice(0, 5);
}
