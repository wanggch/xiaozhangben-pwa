import type { Account, Book, Category, CatType, Cents, State, Tx } from './types';
import { sumAmt } from './money';

export const getBook = (S: State): Book => S.books.find(b => b.id === S.meta.curBook) || S.books[0];
export const bookTx = (S: State): Tx[] => S.tx.filter(t => t.book === S.meta.curBook);
export const monthTx = (S: State, ym: string) => bookTx(S).filter(t => t.date.startsWith(ym));
export function totals(S: State, ym: string) {
  const list = monthTx(S, ym);
  return { exp: sumAmt(list.filter(t => t.type === 'expense')), inc: sumAmt(list.filter(t => t.type === 'income')), list };
}
export type CatWithType = Category & { type: CatType };
export const allCats = (S: State): CatWithType[] => [...S.cats.expense.map(c => ({ ...c, type: 'expense' as const })), ...S.cats.income.map(c => ({ ...c, type: 'income' as const }))];
export const getCat = (S: State, id: string | null): CatWithType => allCats(S).find(c => c.id === id) || { id: id || '', name: '未分类', icon: 'tag', shade: 0, type: 'expense' };
export const getAcct = (S: State, id: string | null | undefined): Account | undefined => id ? S.accounts.find(a => a.id === id) : undefined;
export const acctName = (S: State, id: string | null | undefined) => getAcct(S, id)?.name || '无账户';
export const sortedAccounts = (S: State) => [...S.accounts].sort((a, b) => a.order - b.order);
/** 记一笔的默认账户：设置中指定且仍存在的账户，否则不选择账户（null，不影响任何余额） */
export const defaultRecAcct = (S: State): string | null => { const id = S.settings.defaultAcct; return id && getAcct(S, id) ? id : null; };

/** 余额 = 初始余额 (+示例期初) + 收入 − 支出 ± 转账，统计全部账本 */
export function balance(S: State, id: string): Cents {
  const a = getAcct(S, id); if (!a) return 0;
  let b = (a.init || 0) + (a.sampleInit || 0);
  for (const t of S.tx) {
    if (t.type === 'expense' && t.acct === id) b -= t.amount;
    else if (t.type === 'income' && t.acct === id) b += t.amount;
    else if (t.type === 'transfer') { if (t.acct === id) b -= t.amount; if (t.toAcct === id) b += t.amount; }
  }
  return b;
}
/** 账户流水（不含初始余额）对余额的影响 */
export const flowOf = (S: State, id: string): Cents => { const a = getAcct(S, id); return a ? balance(S, id) - (a.init || 0) - (a.sampleInit || 0) : 0; };

export function netWorth(S: State) {
  let as = 0, li = 0;
  S.accounts.forEach(a => { const b = balance(S, a.id); if (b >= 0) as += b; else li += -b; });
  return { as, li, net: as - li };
}
export const hasSample = (S: State) => S.tx.some(t => t.sample) || S.accounts.some(a => a.sample || a.sampleInit) || S.recurs.some(r => r.sample) || S.books.some(b => b.sample || b.sampleBudget);
