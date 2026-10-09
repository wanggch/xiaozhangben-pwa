/** 导入 / 导出：JSON 完整备份（v3，金额为分）与 CSV；兼容原型导出的 v2 JSON（金额为元） */
import type { Account, AcctType, Book, Category, Freq, Recur, Settings, State, Tx, TxType } from './types';
import { parseCSV, toCSV } from './csv';
import { parseCents, plain } from './money';
import { pad, isValidDate } from './dates';
import { defaultCats, TYPE_NAME } from './constants';
import { defaultBook, defaultSettings, emptyState } from './defaults';
import { acctName, getCat } from './ledger';
import { uid } from './id';

export const BACKUP_VERSION = 3;

export function exportJSON(S: State, now = new Date()): string {
  const data = JSON.parse(JSON.stringify(S)) as State;
  data.settings.pin = null; data.settings.lock = false; // 备份中不含应用锁密码
  return JSON.stringify({ app: 'xiaozhangben', version: BACKUP_VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

export function exportCSV(S: State): string {
  const rows: (string | number)[][] = [['日期', '类型', '分类', '金额', '账户', '转入账户', '备注', '账本', '示例数据']];
  [...S.tx].sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts).forEach(t => rows.push([
    t.date, TYPE_NAME[t.type], t.type === 'transfer' ? '' : getCat(S, t.cat).name, plain(t.amount),
    t.acct ? acctName(S, t.acct) : '', t.toAcct ? acctName(S, t.toAcct) : '', t.note, S.books.find(b => b.id === t.book)?.name || '', t.sample ? '是' : '']));
  return toCSV(rows);
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const ACCT_T: AcctType[] = ['cash', 'bank', 'wechat', 'alipay', 'credit', 'other'];
const FREQS: Freq[] = ['day', 'week', 'month', 'year'];
const TX_T: TxType[] = ['expense', 'income', 'transfer'];

export class ImportError extends Error {}

/**
 * 把任意来源（原型 v2 / 正式版 v3）的备份对象规范化为当前 State。
 * v2 中金额是元（浮点），v3 中是分（整数）。
 */
export function normalizeBackup(input: unknown): State {
  let o: any = input;
  if (o && typeof o === 'object' && o.data && typeof o.data === 'object') {
    const ver = Number(o.version) || 2;
    if (ver > BACKUP_VERSION) throw new ImportError('备份来自更新版本的小账本，请先更新 App');
    o = { ...o.data, __ver: ver };
  } else if (o && typeof o === 'object') o = { ...o, __ver: Number(o.v) >= 3 ? 3 : 2 };
  if (!o || !Array.isArray(o.tx)) throw new ImportError('不是有效的小账本备份');
  const v2 = o.__ver < 3;
  const amt = (x: unknown) => v2 ? parseCents(typeof x === 'number' ? x : str(x)) : Math.round(Number(x) || 0);
  const base = emptyState();

  const cats = (o.cats && Array.isArray(o.cats.expense) && Array.isArray(o.cats.income)) ? o.cats : defaultCats();
  const normCats = (l: any[]): Category[] => l.filter(c => c && c.id).map(c => ({ id: str(c.id, 64), name: str(c.name, 6) || '未命名', icon: str(c.icon, 32) || 'tag', shade: Math.max(0, Math.min(4, Number(c.shade) || 0)) }));
  const state: State = { ...base, cats: { expense: normCats(cats.expense), income: normCats(cats.income) } };
  if (!state.cats.expense.find(c => c.id === 'other')) state.cats.expense.push(defaultCats().expense.find(c => c.id === 'other')!);
  if (!state.cats.income.find(c => c.id === 'iother')) state.cats.income.push(defaultCats().income.find(c => c.id === 'iother')!);

  state.books = (Array.isArray(o.books) ? o.books : []).filter((b: any) => b && b.id).map((b: any, i: number): Book => {
    const cb: Record<string, number> = {};
    Object.entries(b.catBudgets || {}).forEach(([k, val]) => { const c = amt(val); if (c > 0) cb[k] = c; });
    return { id: str(b.id, 64), name: str(b.name, 12) || '账本', budget: Math.max(0, amt(b.budget)), catBudgets: cb, order: Number.isFinite(b.order) ? b.order : i, ...(b.sample ? { sample: true } : {}), ...(b.sampleBudget ? { sampleBudget: true } : {}) };
  });
  if (!state.books.length) state.books = [defaultBook()];

  state.accounts = (Array.isArray(o.accounts) ? o.accounts : []).filter((a: any) => a && a.id).map((a: any, i: number): Account => ({
    id: str(a.id, 64), name: str(a.name, 16) || '账户', type: ACCT_T.includes(a.type) ? a.type : 'other', init: amt(a.init), order: Number.isFinite(a.order) ? a.order : i,
    ...(a.sampleInit ? { sampleInit: amt(a.sampleInit) } : {}), ...(a.sample ? { sample: true } : {}),
  }));
  // 原型 v2 的示例账户把期初写在 init 里，这里转成 sampleInit，方便之后一键清除
  if (v2) state.accounts.forEach(a => { if (a.sample) { a.sampleInit = a.init; a.init = 0; } });

  const curBook = state.books.find(b => b.id === o.curBook || b.id === o.meta?.curBook)?.id || state.books[0].id;
  const bookIds = new Set(state.books.map(b => b.id));
  const acctIds = new Set(state.accounts.map(a => a.id));
  const refAcct = (x: unknown) => { const s = str(x, 64); return s && acctIds.has(s) ? s : null; };

  state.tx = (o.tx as any[]).filter(t => t && TX_T.includes(t.type) && isValidDate(str(t.date, 10))).map((t): Tx => ({
    id: str(t.id, 64) || uid(), book: bookIds.has(t.book) ? t.book : curBook, type: t.type, cat: t.type === 'transfer' ? null : (str(t.cat, 64) || (t.type === 'income' ? 'iother' : 'other')),
    amount: Math.abs(amt(t.amount)), date: str(t.date, 10), note: str(t.note, 200), acct: refAcct(t.acct), toAcct: t.type === 'transfer' ? refAcct(t.toAcct) : null,
    ts: Number(t.ts) || Date.now(), ...(t.recurId ? { recurId: str(t.recurId, 64) } : {}), ...(t.sample ? { sample: true } : {}),
  })).filter(t => t.amount > 0);
  // 去重 id
  const seen = new Set<string>(); state.tx.forEach(t => { if (seen.has(t.id)) t.id = uid(); seen.add(t.id); });

  state.recurs = (Array.isArray(o.recurs) ? o.recurs : []).filter((r: any) => r && r.id && isValidDate(str(r.next, 10))).map((r: any): Recur => ({
    id: str(r.id, 64), book: bookIds.has(r.book) ? r.book : curBook, name: str(r.name, 16) || '周期账单', type: r.type === 'income' ? 'income' : 'expense',
    cat: str(r.cat, 64) || 'other', amount: Math.abs(amt(r.amount)), acct: refAcct(r.acct), freq: FREQS.includes(r.freq) ? r.freq : 'month',
    dom: Math.max(1, Math.min(31, Number(r.dom) || 1)), start: isValidDate(str(r.start, 10)) ? r.start : r.next, next: r.next, mode: r.mode === 'remind' ? 'remind' : 'auto', on: r.on !== false,
    ...(r.sample ? { sample: true } : {}),
  }));

  const st = o.settings || {};
  const ds = defaultSettings();
  state.settings = {
    ...ds, currency: str(st.currency, 4) || '¥', weekStart: Number(st.weekStart) === 0 ? 0 : 1,
    theme: ['auto', 'light', 'dark'].includes(st.theme) ? st.theme : 'auto', remind: !!st.remind,
    remindTime: /^\d{2}:\d{2}$/.test(st.remindTime) ? st.remindTime : ds.remindTime,
    defaultAcct: refAcct(st.defaultAcct),
  } as Settings;
  const m = o.meta || o;
  state.meta = {
    onboarded: true, curBook, history: (Array.isArray(m.history) ? m.history : []).map((h: unknown) => str(h, 40)).filter(Boolean).slice(0, 8),
    sampleTip: !!m.sampleTip, lastAcct: refAcct(m.lastAcct),
  };
  return state;
}

export function parseBackupText(text: string): State {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new ImportError('JSON 文件无法解析'); }
  return normalizeBackup(o);
}

/** CSV 导入：合并进当前数据，返回统计；会自动创建缺失的分类与账户 */
export function importCSV(S: State, text: string) {
  const rows = parseCSV(text.replace(/^\ufeff/, ''));
  if (rows.length < 2) throw new ImportError('CSV 中没有数据');
  const h = rows[0].map(x => x.trim()); const ix = (k: string) => h.indexOf(k);
  const iD = ix('日期'), iT = ix('类型'), iC = ix('分类'), iA = ix('金额'), iN = ix('备注'), iAc = ix('账户'), iTo = ix('转入账户'), iB = ix('账本');
  if (iD < 0 || iA < 0) throw new ImportError('CSV 需要包含「日期」「金额」列');
  let n = 0, newCats = 0, newAccts = 0, skipped = 0;
  const findAcct = (name: string) => {
    name = (name || '').trim(); if (!name) return null;
    let a = S.accounts.find(x => x.name === name);
    if (!a) { a = { id: 'a' + uid(), name: name.slice(0, 16), type: 'other', init: 0, order: S.accounts.length }; S.accounts.push(a); newAccts++; }
    return a.id;
  };
  const base = Date.now();
  rows.slice(1).forEach(r => {
    const raw = (r[iD] || '').trim().replace(/[/.年月]/g, '-').replace(/日/g, '');
    const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const amount = Math.abs(parseCents((r[iA] || '').replace(/[^\d.\-]/g, '')));
    const date = m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : '';
    if (!m || !isValidDate(date) || !(amount > 0)) { skipped++; return; }
    const tt = iT >= 0 ? (r[iT] || '').trim() : '';
    const type: TxType = /收入|income/i.test(tt) ? 'income' : /转账|transfer/i.test(tt) ? 'transfer' : 'expense';
    const bookName = iB >= 0 ? (r[iB] || '').trim() : '';
    const book = (bookName && S.books.find(b => b.name === bookName)?.id) || S.meta.curBook;
    const note = iN >= 0 ? (r[iN] || '').trim().replace(/^'(?=[=+\-@])/, '').slice(0, 200) : '';
    const t: Tx = { id: uid(), book, type, amount, date, note, ts: base + n, acct: iAc >= 0 ? findAcct(r[iAc]) : null, toAcct: null, cat: null };
    if (type === 'transfer') { t.toAcct = iTo >= 0 ? findAcct(r[iTo]) : null; if (!t.acct || !t.toAcct || t.acct === t.toAcct) { skipped++; return; } }
    else {
      const cn = ((iC >= 0 ? r[iC] : '') || '').trim() || '其他';
      let c = S.cats[type].find(x => x.name === cn || x.name === cn.slice(0, 6));
      if (!c) { c = { id: 'c' + uid(), name: cn.slice(0, 6), icon: 'tag', shade: 0 }; S.cats[type].push(c); newCats++; }
      t.cat = c.id;
    }
    S.tx.push(t); n++;
  });
  return { n, newCats, newAccts, skipped };
}
