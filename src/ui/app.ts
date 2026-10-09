/**
 * UI 内核：共享 UI 状态、页面注册表、导航栈（含系统返回键）、弹层、Toast、撤销、动效工具
 */
import { S, save, replaceState, snapshot } from '../data/store';
import type { Account, State, Tx } from '../core/types';
import { fmt2, money as moneyFmt, sumAmt } from '../core/money';
import { curYM, dayLabel, today, ymLabel } from '../core/dates';
import { getCat, acctName } from '../core/ledger';
import { ACCT_TYPES } from '../core/constants';
import type { Period } from '../core/stats';
import { $, $$, esc, raf2 } from './dom';
import { ico } from './icons';
import { illus } from './illus';
import { acctTone, catTone } from '../core/tones';

/* ---------- 共享 UI 状态 ---------- */
export const ui = {
  tab: 'home' as 'home' | 'stats' | 'assets' | 'me',
  month: curYM(), filter: 'all', statType: 'expense' as 'expense' | 'income', statSel: null as string | null,
  period: 'month' as Period, anchor: today(), rcFilter: 'all',
  search: { q: '', type: 'all', cats: [] as string[], min: '', max: '', from: '', to: '' },
};

/* ---------- 格式化帮助 ---------- */
export const cur = () => S?.settings?.currency || '¥';
export const money = (c: number) => moneyFmt(c, cur());
export const bigHTML = (v: number) => { const [i, d] = fmt2(v).split('.'); return `<span class="cur">${v < 0 ? '-' : ''}${esc(cur())}</span>${i}<span class="dec">.${d}</span>`; };
export const toneIco = (icon: string, tone: string, cls = '') => `<span class="cat-ico t-${tone}${cls ? ' ' + cls : ''}">${ico(icon)}</span>`;
export const catIco = (id: string | null) => { const c = getCat(S, id); return toneIco(c.icon, catTone(c)); };
export const acctIco = (a?: Account) => toneIco(a ? ACCT_TYPES[a.type]?.icon || 'wallet' : 'wallet', acctTone(a?.type));
export const txIco = (t: Tx) => t.type === 'transfer' ? toneIco('transfer', 'slate') : catIco(t.cat);
export const txTitle = (t: Tx) => t.type === 'transfer' ? '转账' : getCat(S, t.cat).name;
export const txSub = (t: Tx) => t.type === 'transfer' ? `${esc(acctName(S, t.acct))} → ${esc(acctName(S, t.toAcct))}${t.note ? ' · ' + esc(t.note) : ''}` : (esc(t.note) || '无备注');
export const txAmt = (t: Tx) => t.type === 'transfer' ? fmt2(t.amount) : (t.type === 'income' ? '+' : '-') + fmt2(t.amount);
export const sampleTag = (o?: { sample?: boolean } | null) => o && o.sample ? '<span class="tag">示例</span>' : '';
export const empty = (icon: string, text: string, extra = '') => {
  const [t, ...rest] = text.split(/<br\/?>/); const il = illus(icon);
  return `<div class="empty">${il ? `<div class="ill-svg">${il}</div>` : `<div class="ill">${ico(icon)}</div>`}<p class="e-t">${t}</p>${rest.length ? `<p class="e-s">${rest.join('<br/>')}</p>` : ''}${extra}</div>`;
};
export const segHTML = (key: string, opts: [string | number, string][], curV: unknown, cls = '', label = '') =>
  `<div class="seg ${cls}" data-seg="${key}" role="tablist"${label ? ` aria-label="${label}"` : ''}><span class="knob"></span>${opts.map(([v, n]) => `<button data-v="${v}" role="tab" aria-selected="${String(curV) === String(v)}" class="${String(curV) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
export const monthPill = () => `<div class="month"><button data-mon="-1" aria-label="上个月">${ico('left')}</button><span>${ymLabel(ui.month)}</span><button data-mon="1" ${ui.month >= curYM() ? 'disabled' : ''} aria-label="下个月">${ico('right')}</button></div>`;

/* ---------- 账单列表行 ---------- */
export const txRow = (t: Tx, hl?: (s: string) => string) => `<div class="tx" data-id="${esc(t.id)}"><button class="tx-del" data-del="${esc(t.id)}" tabindex="-1">${ico('trash')}删除</button>
  <div class="tx-main" role="button" tabindex="0" aria-label="${esc(txTitle(t))} ${txAmt(t)}">${txIco(t)}<div class="tx-info"><div class="tx-name">${esc(txTitle(t))}</div><div class="tx-note">${hl ? hl(txSub(t)) : txSub(t)}</div></div>
  <div class="amt num ${t.type === 'income' ? 'in' : t.type === 'transfer' ? 'xf' : ''}">${txAmt(t)}</div></div></div>`;
export function groupList(list: Tx[], opts: { hl?: (s: string) => string } = {}) {
  const groups: Record<string, Tx[]> = {};
  [...list].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).forEach(t => (groups[t.date] ||= []).push(t));
  return Object.keys(groups).map((d, i) => {
    const g = groups[d], L = dayLabel(d);
    const e = sumAmt(g.filter(t => t.type === 'expense')), n = sumAmt(g.filter(t => t.type === 'income'));
    return `<div class="day" style="animation-delay:${Math.min(i, 6) * 45}ms"><div class="day-h"><span><b>${L.main}</b>${L.rel}</span><span class="num">${e ? '支出 ' + money(e) : ''}${e && n ? '  ·  ' : ''}${n ? '收入 ' + money(n) : ''}</span></div>
      <div class="day-card">${g.map(t => txRow(t, opts.hl)).join('')}</div></div>`;
  }).join('');
}

/* ---------- 动效 ---------- */
export function countUp(root: ParentNode) {
  $$<HTMLElement>('[data-count]', root).forEach(el => {
    const to = +el.dataset.count!, t0 = performance.now(), dur = 950, f = el.dataset.fmt || 'money';
    el.removeAttribute('data-count');
    // 统一取整到分，保证动画过程中与结束时的金额格式完全一致
    const out = (v: number) => f === 'big' ? (el.innerHTML = bigHTML(Math.round(v))) : (el.textContent = f === 'pct' ? Math.round(v) + '%' : f === 'int' ? Math.round(v) + '' : money(Math.round(v)));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { out(to); return; }
    const step = (now: number) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4); out(p < 1 ? to * e : to); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
export const growBars = (el: ParentNode) => raf2(() => $$<HTMLElement>('[data-w]', el).forEach(i => i.style.width = i.dataset.w + '%'));
export function setSegKnob(seg: Element | null) {
  if (!seg) return; const on = $<HTMLElement>('button.on', seg), k = $<HTMLElement>('.knob', seg); if (!on || !k) return;
  if (!on.offsetWidth) { requestAnimationFrame(() => on.offsetWidth && setSegKnob(seg)); return; }
  k.style.width = on.offsetWidth + 'px'; k.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
export const initSegs = (root: ParentNode) => $$('.seg', root).forEach(setSegKnob);
export const segVal = (root: ParentNode, key: string) => $<HTMLElement>(`.seg[data-seg="${key}"] button.on`, root)?.dataset.v || '';

/* ---------- Toast ---------- */
let toastTimer: number | undefined;
export function toast(msg: string, kind: 'ok' | 'warn' = 'ok', action?: string, fn?: () => void) {
  const t = $('#toast'); t.className = 'toast ' + kind;
  t.innerHTML = `${ico(kind === 'warn' ? 'alert' : 'check')}<span>${msg}</span>${action ? `<button>${action}</button>` : ''}`;
  if (action && fn) $('button', t).onclick = () => { t.classList.remove('show'); fn(); };
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('show'), action ? 4200 : 2400);
}

/* ---------- 底部弹层 ---------- */
let sheetOnClose: (() => void) | null = null;
export function openSheet(html: string, onMount?: (b: HTMLElement) => void, onClose?: () => void) {
  const b = $('#sheetBody'); b.innerHTML = html; b.scrollTop = 0;
  $('#mask').classList.add('show'); const sh = $('#sheet'); sh.classList.add('show'); sh.setAttribute('aria-hidden', 'false'); sh.scrollTop = 0;
  sheetOnClose = onClose || null;
  initSegs(b); onMount?.(b); syncHistory();
  requestAnimationFrame(() => { if (!b.contains(document.activeElement)) ($<HTMLElement>('h3', b))?.focus?.({ preventScroll: true }); });
}
export function closeSheet() {
  if (!sheetOpen()) return;
  $('#mask').classList.remove('show'); const sh = $('#sheet'); sh.classList.remove('show'); sh.setAttribute('aria-hidden', 'true');
  (document.activeElement as HTMLElement)?.blur?.();
  const f = sheetOnClose; sheetOnClose = null; f?.();
  syncHistory();
}
export const sheetOpen = () => $('#sheet').classList.contains('show');
export function confirmSheet(title: string, desc: string, okText: string, fn: () => void, danger = true) {
  openSheet(`<h3 tabindex="-1">${title}</h3><p class="d">${desc}</p><div class="btns"><button class="btn ghost" data-x>取消</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${okText}</button></div>`, b => {
    $('[data-x]', b).onclick = closeSheet; $('[data-ok]', b).onclick = () => { closeSheet(); fn(); };
  });
}

/* ---------- 撤销 ---------- */
export function withUndo(msg: string | (() => string), fn: () => void) {
  const snap = snapshot(); fn(); save(); refresh();
  toast(typeof msg === 'function' ? msg() : msg, 'ok', '撤销', () => { replaceState(snap); refresh(); applyThemeHook(); toast('已撤销'); });
}
let applyThemeHook = () => { /* 由 theme 模块注入 */ };
export const setApplyThemeHook = (f: () => void) => { applyThemeHook = f; };

/* ---------- 页面注册表 ---------- */
export interface SubDef { title: string; right?: string; body: string; mount?: (el: HTMLElement, pg: SubPage) => void; [k: string]: unknown }
export interface SubPage { name: string; params: any; el: HTMLElement; refresh?: () => void; save?: () => void }
export const RENDER: Record<string, () => void> = {};
export const SUB: Record<string, (p: any, pg: SubPage) => SubDef> = {};
export const ACT: Record<string, (b: HTMLElement) => void> = {};

/* ---------- 二级页面栈 ---------- */
export const stack: SubPage[] = [];
const KEEP = new Set(['acctEdit', 'catEdit', 'recurEdit', 'search']);
let closeRowHook: () => void = () => { /* 由 swipe 模块注入 */ };
export const setCloseRowHook = (f: () => void) => { closeRowHook = f; };

export function push(name: string, params: any = {}) {
  if (!SUB[name]) return;
  closeRowHook();
  const el = document.createElement('section'); el.className = 'sub'; el.dataset.name = name; el.setAttribute('role', 'region');
  $('#subs').appendChild(el);
  const pg: SubPage = { name, params, el };
  const below = stack.length ? stack[stack.length - 1].el : $('#root');
  below.classList.add('behind'); below.setAttribute('aria-hidden', 'true');
  stack.push(pg); renderSub(pg, true);
  raf2(() => { el.classList.add('in'); initSegs(el); });
  syncHistory();
  return pg;
}
export function pop() {
  const pg = stack.pop(); if (!pg) return;
  pg.el.classList.remove('in', 'behind'); pg.el.style.transform = ''; setTimeout(() => pg.el.remove(), 520);
  const prev = stack[stack.length - 1];
  const below = prev ? prev.el : $('#root');
  below.classList.remove('behind'); below.style.transform = ''; below.style.opacity = ''; below.removeAttribute('aria-hidden');
  if (prev) renderSub(prev); else renderTab();
  syncHistory();
}
export function popAll() { while (stack.length) pop(); }
export const top = () => stack[stack.length - 1];

export function renderSub(pg: SubPage, first = false) {
  if (!first && KEEP.has(pg.name)) { pg.refresh?.(); return; }
  const def = SUB[pg.name](pg.params, pg);
  const old = $('.sub-b', pg.el); const st = old ? old.scrollTop : 0;
  pg.el.setAttribute('aria-label', def.title.replace(/<[^>]+>/g, ''));
  pg.el.innerHTML = `<header class="sub-h"><div><button class="back" data-back aria-label="返回">${ico('left')}</button></div><h2>${def.title}</h2><div class="sub-r">${def.right || ''}</div></header><div class="sub-b">${def.body}</div>`;
  const nb = $('.sub-b', pg.el); nb.scrollTop = st;
  if (!first) $$('.group,.card,.day,.dt-top,.empty,.due', nb).forEach(e => e.style.animation = 'none');
  initSegs(pg.el); countUp(pg.el); growBars(pg.el); def.mount?.(pg.el, pg);
}
export function refresh() { renderTab(); stack.forEach(pg => renderSub(pg)); refreshRecHook(); }
let refreshRecHook = () => { /* 记一笔面板打开时同步刷新 */ };
export const setRefreshRecHook = (f: () => void) => { refreshRecHook = f; };

export function renderTab() { RENDER[ui.tab]?.(); }
export function switchTab(tab: typeof ui.tab) {
  popAll();
  if (tab === ui.tab) { $('#p-' + tab).scrollTo({ top: 0, behavior: 'smooth' }); return; }
  ui.tab = tab; closeRowHook();
  $$('.tab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $$('.page').forEach(p => { const on = p.id === 'p-' + tab; p.classList.toggle('active', on); p.toggleAttribute('inert', !on); });
  $('#p-' + tab).scrollTop = 0; renderTab();
}

/* ---------- 系统返回键 / 浏览器后退：关闭最上层的弹层或二级页 ---------- */
let guard = false; let ignoreUntil = 0;
let isRecOpen = () => false, closeRecFn = () => { /* 注入 */ }, isLockOpen = () => false;
export const setLayerHooks = (o: { recOpen: () => boolean; closeRec: () => void; lockOpen: () => boolean }) => { isRecOpen = o.recOpen; closeRecFn = o.closeRec; isLockOpen = o.lockOpen; };
const anyLayer = () => sheetOpen() || isRecOpen() || stack.length > 0;
export function syncHistory() {
  if (anyLayer() && !guard) { history.pushState({ xzb: 1 }, ''); guard = true; }
  else if (!anyLayer() && guard) { guard = false; ignoreUntil = Date.now() + 700; history.back(); }
}
/** 关闭最上层（返回键、Esc、左缘滑动共用） */
export function closeTop(): boolean {
  if (sheetOpen()) { closeSheet(); return true; }
  if (isRecOpen()) { closeRecFn(); return true; }
  if (stack.length) { pop(); return true; }
  return false;
}
export function initHistory() {
  if (history.state?.xzb) history.replaceState(null, '');
  addEventListener('popstate', () => {
    if (Date.now() < ignoreUntil) { ignoreUntil = 0; syncHistory(); return; }
    if (history.state?.xzb) { guard = anyLayer(); return; }
    guard = false;
    if (isLockOpen()) { syncHistory(); return; }
    closeTop(); syncHistory();
  });
}

/* ---------- 其他 ---------- */
export const setState = (s: State) => replaceState(s);
export { S, save };
