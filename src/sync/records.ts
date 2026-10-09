/**
 * 账本状态 ⇄ 同步记录 的映射（纯函数，便于测试）
 * 记录类型：tx 账单 / account 账户 / book 账本（含预算）/ recur 周期规则 / cat 分类 / settings 设置
 * 应用锁（lock、pin）只存本机，永不上传。
 */
import type { Category, State } from '../core/types';

export type Kind = 'tx' | 'account' | 'book' | 'recur' | 'cat' | 'settings';
export interface Rec { kind: Kind; id: string; data: Record<string, unknown> }
export interface RemoteChange { kind: Kind; id: string; deleted: boolean; data: any; updatedAt: number; seq: number }

export const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;
export const LOCAL_ONLY_SETTINGS = ['lock', 'pin'] as const;

/** 当前状态的全部可同步记录：key → JSON（序列化方式固定，用于和同步基线比较） */
export function toRecords(S: State): Map<string, Rec & { json: string }> {
  const m = new Map<string, Rec & { json: string }>();
  const add = (kind: Kind, id: string, data: Record<string, unknown>) => m.set(keyOf(kind, id), { kind, id, data, json: JSON.stringify(data) });
  for (const t of S.tx) add('tx', t.id, t as any);
  for (const a of S.accounts) add('account', a.id, a as any);
  for (const b of S.books) add('book', b.id, b as any);
  for (const r of S.recurs) add('recur', r.id, r as any);
  for (const type of ['expense', 'income'] as const) S.cats[type].forEach((c, order) => add('cat', c.id, { ...stripCat(c), type, order }));
  const { lock: _l, pin: _p, ...shared } = S.settings;
  add('settings', 'settings', shared as any);
  return m;
}
const stripCat = (c: Category & { type?: unknown; order?: unknown }) => { const { type: _t, order: _o, ...rest } = c as any; return rest as Category; };

const COLL = { tx: 'tx', account: 'accounts', book: 'books', recur: 'recurs' } as const;

/** 把云端变更应用到状态（原地修改） */
export function applyRemote(S: State, c: RemoteChange) {
  if (c.kind === 'settings') {
    if (c.deleted || !c.data) return;
    const { lock: _l, pin: _p, ...rest } = c.data;
    Object.assign(S.settings, rest);
    return;
  }
  if (c.kind === 'cat') {
    for (const type of ['expense', 'income'] as const) S.cats[type] = S.cats[type].filter(x => x.id !== c.id);
    if (c.deleted || !c.data) return;
    const { type, order, ...cat } = c.data as Category & { type: 'expense' | 'income'; order: number };
    // 按云端记录的位置插入（同一批推送的分类按顺序到达，依次插入即可还原排序）
    const list = S.cats[type === 'income' ? 'income' : 'expense'];
    list.splice(Math.max(0, Math.min(Number(order) || 0, list.length)), 0, cat as Category);
    return;
  }
  const arr = S[COLL[c.kind]] as { id: string }[];
  const i = arr.findIndex(x => x.id === c.id);
  if (c.deleted || !c.data) { if (i >= 0) arr.splice(i, 1); return; }
  if (i >= 0) arr[i] = c.data; else arr.push(c.data);
}

/** 应用远端变更后保证状态可用（至少一个账本、当前账本有效） */
export function repairState(S: State, fallbackBook: () => State['books'][number]) {
  if (!S.books.length) S.books.push(fallbackBook());
  if (!S.books.some(b => b.id === S.meta.curBook)) S.meta.curBook = [...S.books].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0].id;
  if (S.meta.lastAcct && !S.accounts.some(a => a.id === S.meta.lastAcct)) S.meta.lastAcct = null;
  if (S.settings.defaultAcct && !S.accounts.some(a => a.id === S.settings.defaultAcct)) S.settings.defaultAcct = null;
}

/** 本机是否有「用户数据」（区别于首次启动的默认账本） */
export function hasUserData(S: State, defaults: State): boolean {
  if (S.tx.length || S.recurs.length) return true;
  const sig = (s: State) => JSON.stringify([s.books.map(b => [b.id, b.name, b.budget]), s.accounts.map(a => [a.id, a.name, a.init]), s.cats]);
  return sig(S) !== sig(defaults);
}
