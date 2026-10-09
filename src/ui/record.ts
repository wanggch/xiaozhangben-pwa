/** 记一笔面板：支出 / 收入 / 转账，数字键盘支持加减 */
import { S, save } from '../data/store';
import { ui, cur, money, catIco, acctIco, openSheet, closeSheet, toast, refresh, popAll, push, stack, switchTab, setSegKnob, syncHistory, RENDER, setRefreshRecHook } from './app';
import { $, $$, esc, vibrate } from './dom';
import { ico } from './icons';
import { balance, getAcct, getBook, getCat, monthTx, sortedAccounts, totals } from '../core/ledger';
import { sumAmt } from '../core/money';
import { curYM, dayLabel, today } from '../core/dates';
import { centsToExpr, displayValue, evalExpr, exprLine, hasOp, press as pressKey, type Key } from '../core/expr';
import { budgetAlert } from '../core/budget';
import { ACCT_TYPES } from '../core/constants';
import { uid } from '../core/id';
import type { Tx, TxType } from '../core/types';
import { closeRow } from './gestures';

export const rec = { type: 'expense' as TxType, cat: null as string | null, expr: '', evald: false, date: today(), note: '', acct: null as string | null, toAcct: null as string | null, editId: null as string | null, copy: false };
const KEYS: Key[] = ['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', '-', '.', '0', 'again', 'ok'];
const KEY_LABEL: Partial<Record<Key, string>> = { back: '退格', '+': '加', '-': '减', '.': '小数点', again: '再记一笔', ok: '完成' };

export function initRecord() {
  $('#keypad').innerHTML = KEYS.map(k => `<button class="key ${k === '+' || k === '-' ? 'op' : ''} ${k === 'again' ? 'again' : ''} ${k === 'ok' ? 'ok' : ''}" data-k="${k}" aria-label="${KEY_LABEL[k] || k}">${k === 'back' ? ico('back') : k === 'again' ? '再记' : k === 'ok' ? '完成' : k === '-' ? '−' : k}</button>`).join('');
  $('#recClose').addEventListener('click', closeRec);
  $('#recSeg').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('button'); if (!b || b.dataset.v === rec.type) return;
    if (b.dataset.v === 'transfer' && S.accounts.length < 2) { toast('至少需要两个账户才能转账', 'warn'); return; }
    setRecType(b.dataset.v as TxType);
  });
  $('#cats').addEventListener('click', e => {
    const t = e.target as Element;
    if (t.closest('#swapBtn')) { [rec.acct, rec.toAcct] = [rec.toAcct, rec.acct]; renderCats(); requestAnimationFrame(() => $('#swapBtn').classList.add('spin')); return; }
    const pk = t.closest<HTMLElement>('[data-pick]'); if (pk) { acctPicker(pk.dataset.pick === 'from' ? 'acct' : 'toAcct'); return; }
    const b = t.closest<HTMLElement>('.cat'); if (!b) return;
    if (b.dataset.c === '__manage') { const tp = rec.type; closeRec(); popAll(); push('cats', { type: tp }); return; }
    rec.cat = b.dataset.c!; $$('.cat').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); renderSel(); vibrate(5);
  });
  $('#acctChip').addEventListener('click', () => acctPicker('acct'));
  const dateIn = $<HTMLInputElement>('#dateIn');
  dateIn.addEventListener('change', () => { if (dateIn.value) { rec.date = dateIn.value > today() ? today() : dateIn.value; renderDate(); } });
  $('.date-chip').addEventListener('click', e => { try { (dateIn as any).showPicker(); e.preventDefault(); } catch { /* iOS 直接点 input */ } });
  $<HTMLInputElement>('#noteIn').addEventListener('input', e => rec.note = (e.target as HTMLInputElement).value);
  $('#keypad').addEventListener('click', e => { const b = (e.target as Element).closest<HTMLElement>('.key'); if (b) press(b.dataset.k as Key); });
  $('#fab').addEventListener('click', () => openRec());
  setRefreshRecHook(() => { if (recOpen()) { renderCats(); renderAmount(); } });
}

function renderSel() {
  if (rec.type === 'transfer') { $('#selLbl').innerHTML = `${ico('transfer')}转账`; return; }
  const c = getCat(S, rec.cat); $('#selLbl').innerHTML = `${ico(c.icon)}${esc(c.name)}`;
}
export function renderCats() {
  const box = $('#cats');
  if (rec.type === 'transfer') {
    const f = getAcct(S, rec.acct), t = getAcct(S, rec.toAcct);
    const card = (a: ReturnType<typeof getAcct>, l: string, k: string) => `<button class="xa" data-pick="${k}">${a ? acctIco(a) : `<span class="cat-ico sh0">${ico('plus')}</span>`}<div><div class="l">${l}</div><div class="n">${a ? esc(a.name) : '选择账户'}</div></div>${a ? `<span class="b num">${money(balance(S, a.id))}</span>` : ''}</button>`;
    box.style.display = 'block';
    box.innerHTML = `<div class="xfer">${card(f, '转出账户', 'from')}${card(t, '转入账户', 'to')}<button class="swap" id="swapBtn" aria-label="交换转出和转入账户">${ico('swap')}</button></div><div class="xhint">${S.accounts.length < 2 ? '至少需要两个账户才能转账' : '例如信用卡还款、提现、零钱充值'}</div>`;
  } else {
    box.style.display = '';
    box.innerHTML = S.cats[rec.type].map((c, i) => `<button class="cat ${rec.cat === c.id ? 'on' : ''}" aria-pressed="${rec.cat === c.id}" data-c="${esc(c.id)}" style="animation-delay:${i * 25}ms">${catIco(c.id)}${esc(c.name)}</button>`).join('')
      + `<button class="cat manage" data-c="__manage" style="animation-delay:${S.cats[rec.type].length * 25}ms"><span class="cat-ico">${ico('grid')}</span>管理</button>`;
  }
  renderSel(); renderAcctChip();
}
function renderAcctChip() {
  const chip = $('#acctChip'); chip.style.display = rec.type === 'transfer' ? 'none' : '';
  const a = getAcct(S, rec.acct); chip.innerHTML = `${ico(a ? ACCT_TYPES[a.type].icon : 'wallet')}<span>${a ? esc(a.name) : '无账户'}</span>`;
  chip.setAttribute('aria-label', '账户：' + (a ? a.name : '无账户'));
}
export function renderAmount() {
  const d = $('#amountDisp'); const st = { expr: rec.expr, evald: rec.evald };
  $('#recCur').textContent = cur();
  $('.val', d).textContent = displayValue(st);
  $('.expr', d).textContent = exprLine(st) || (rec.copy ? '复制自原账单' : '');
  d.classList.toggle('zero', !rec.expr);
  const ok = $('[data-k="ok"]'); ok.textContent = hasOp(rec.expr) ? '=' : (rec.editId ? '保存' : '完成'); ok.setAttribute('aria-label', hasOp(rec.expr) ? '计算结果' : rec.editId ? '保存' : '完成');
  $('[data-k="again"]').style.visibility = rec.editId ? 'hidden' : '';
}
function renderDate() { const L = dayLabel(rec.date); $('#dateLbl').textContent = ['今天', '昨天', '前天'].includes(L.rel) ? L.rel : L.main; $<HTMLInputElement>('#dateIn').value = rec.date; }
function setRecType(type: TxType) {
  rec.type = type; $('#rec').dataset.type = type;
  if (type !== 'transfer' && (getCat(S, rec.cat).type !== type || !S.cats[type].find(c => c.id === rec.cat))) rec.cat = S.cats[type][0]?.id || null;
  if (type === 'transfer') {
    const accts = sortedAccounts(S);
    if (!getAcct(S, rec.acct)) rec.acct = accts[0]?.id || null;
    if (!getAcct(S, rec.toAcct) || rec.toAcct === rec.acct) rec.toAcct = accts.find(a => a.id !== rec.acct)?.id || null;
  }
  const seg = $('#recSeg'); $$('button', seg).forEach(b => { const on = b.dataset.v === type; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); setSegKnob(seg); renderCats(); renderAmount();
}
export function openRec(o: { edit?: Tx; copy?: Tx; date?: string; type?: TxType; acct?: string } = {}) {
  closeRow();
  const t = o.edit || o.copy; const T = today();
  if (t) Object.assign(rec, { evald: true, type: t.type, cat: t.cat || null, expr: centsToExpr(t.amount), date: o.copy ? T : t.date, note: t.note || '', acct: t.acct || null, toAcct: t.toAcct || null, editId: o.edit ? t.id : null, copy: !!o.copy });
  else Object.assign(rec, { evald: false, expr: '', date: o.date || T, note: '', editId: null, copy: false, type: o.type || (rec.type === 'transfer' ? 'expense' : rec.type), acct: o.acct || (getAcct(S, S.meta.lastAcct) ? S.meta.lastAcct : sortedAccounts(S)[0]?.id || null), toAcct: null });
  if (o.type === 'transfer' && o.acct) { rec.acct = o.acct; rec.toAcct = null; }
  $<HTMLInputElement>('#noteIn').value = rec.note; $<HTMLInputElement>('#dateIn').max = T;
  const R = $('#rec'); R.classList.add('open'); R.removeAttribute('inert'); R.setAttribute('aria-hidden', 'false');
  $('#root').setAttribute('inert', ''); $('#subs').setAttribute('inert', '');
  setRecType(rec.type); requestAnimationFrame(() => setSegKnob($('#recSeg'))); renderAmount(); renderDate();
  syncHistory();
}
export function closeRec() {
  if (!recOpen()) return;
  const R = $('#rec'); R.classList.remove('open'); R.setAttribute('inert', ''); R.setAttribute('aria-hidden', 'true');
  $('#root').removeAttribute('inert'); $('#subs').removeAttribute('inert');
  (document.activeElement as HTMLElement)?.blur?.();
  syncHistory();
}
export const recOpen = () => $('#rec').classList.contains('open');

function acctPicker(field: 'acct' | 'toAcct') {
  const allowNone = rec.type !== 'transfer';
  openSheet(`<h3 tabindex="-1">${field === 'toAcct' ? '转入账户' : rec.type === 'transfer' ? '转出账户' : '选择账户'}</h3><p class="d">余额会随记账自动更新</p>
    <div class="scroll"><div class="group">${sortedAccounts(S).map(a => `<button class="li" data-a="${esc(a.id)}" ${rec.type === 'transfer' && a.id === (field === 'acct' ? rec.toAcct : rec.acct) ? 'disabled style="opacity:.35"' : ''}>${acctIco(a)}<span class="grow">${esc(a.name)}<span class="sm">${ACCT_TYPES[a.type].name}</span></span><span class="rv num">${money(balance(S, a.id))}</span>${rec[field] === a.id ? `<span class="check">${ico('check')}</span>` : ''}</button>`).join('')}
    ${allowNone ? `<button class="li" data-a=""><span class="cat-ico sh0">${ico('x')}</span><span class="grow">不选择账户</span>${!rec[field] ? `<span class="check">${ico('check')}</span>` : ''}</button>` : ''}</div></div>
    <div class="btns"><button class="btn ghost" data-newacct>${ico('plus')}新增账户</button></div>`, b => {
    $$('[data-a]', b).forEach(x => x.onclick = () => { rec[field] = x.dataset.a || null; closeSheet(); renderCats(); });
    $('[data-newacct]', b).onclick = () => { closeSheet(); closeRec(); popAll(); push('acctEdit'); };
  });
}

const bump = () => { const d = $('#amountDisp'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); vibrate(20); };
export function press(k: Key) {
  const { state, action } = pressKey({ expr: rec.expr, evald: rec.evald }, k);
  if (action === 'bump') return bump();
  if (action === 'commit') return commit(false);
  if (action === 'commitAgain') return commit(true);
  if (state.expr === rec.expr && state.evald === rec.evald) return;
  rec.expr = state.expr; rec.evald = state.evald; rec.copy = false; renderAmount();
}

function commit(again: boolean) {
  const amount = evalExpr(rec.expr);
  if (!(amount > 0)) { bump(); toast('请先输入金额', 'warn'); return; }
  if (rec.type === 'transfer') {
    if (!rec.acct || !rec.toAcct) { toast('请选择转出和转入账户', 'warn'); return; }
    if (rec.acct === rec.toAcct) { toast('转出和转入不能是同一账户', 'warn'); return; }
  } else if (!rec.cat) { toast('请选择分类', 'warn'); return; }
  const bk = getBook(S); const ym = curYM(); const before = totals(S, ym).exp, wasEdit = !!rec.editId, wasCopy = rec.copy;
  const fields = { type: rec.type, cat: rec.type === 'transfer' ? null : rec.cat, amount, date: rec.date, note: rec.note.trim().slice(0, 30), acct: rec.acct || null, toAcct: rec.type === 'transfer' ? rec.toAcct : null };
  let t: Tx;
  if (wasEdit) { t = S.tx.find(x => x.id === rec.editId)!; if (!t) { toast('这笔账单已被删除', 'warn'); closeRec(); return; } Object.assign(t, fields); }
  else { t = { id: uid(), book: S.meta.curBook, ts: Date.now(), ...fields }; S.tx.push(t); }
  if (rec.type !== 'transfer' && rec.acct) S.meta.lastAcct = rec.acct;
  save(); vibrate(12);
  const after = totals(S, ym).exp;
  let msg = wasEdit ? '已保存修改' : rec.type === 'transfer' ? `已转账 ${money(amount)}` : `${wasCopy ? '已复制' : '已记录'} ${esc(getCat(S, t.cat).name)} ${money(amount)}`; let kind: 'ok' | 'warn' = 'ok';
  if (t.type === 'expense' && t.date.startsWith(ym) && t.book === S.meta.curBook) {
    const cs = sumAmt(monthTx(S, ym).filter(x => x.cat === t.cat && x.type === 'expense'));
    const alert = budgetAlert({ before, after, budget: bk.budget, catName: esc(getCat(S, t.cat).name), catBudget: bk.catBudgets[t.cat!], catSpent: cs, cur: cur() });
    if (alert) { msg = alert; kind = 'warn'; }
  }
  toast(msg, kind);
  if (again) { rec.expr = ''; rec.evald = false; rec.note = ''; rec.copy = false; $<HTMLInputElement>('#noteIn').value = ''; renderAmount(); renderCats(); refresh(); return; }
  closeRec();
  if (stack.length || ui.tab === 'assets') { refresh(); return; }
  ui.month = t.date.slice(0, 7); ui.filter = 'all';
  if (ui.tab !== 'home') switchTab('home'); else RENDER.home();
  setTimeout(() => { const row = $(`#p-home .tx[data-id="${CSS.escape(t.id)}"]`); if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 420);
}
