/** 全局事件委托与动作表（对应原型的 ACT / data-* 交互） */
import { S, save, replaceState, flush } from '../data/store';
import { ACT, ui, switchTab, toast, openSheet, closeSheet, confirmSheet, withUndo, refresh, push, pop, top, RENDER, renderTab, setSegKnob, closeTop, sheetOpen, money } from './app';
import { $, $$, esc } from './dom';
import { ico } from './icons';
import { getAcct, getCat, sortedAccounts } from '../core/ledger';
import { ymAdd, curYM, today } from '../core/dates';
import { periodRange, shiftAnchor } from '../core/stats';
import { advance, runRecurring, txFromRule } from '../core/recurring';
import { applySamples, clearSamples } from '../core/samples';
import { clearedState } from '../core/defaults';
import { exportCSV, exportJSON, importCSV, parseBackupText, ImportError } from '../core/io';
import { CURRENCIES } from '../core/constants';
import { openRec, recOpen, closeRec, press, renderAmount } from './record';
import { lockOpen, lockKey, showLock, persistLock } from './lock';
import { showOnboarding, obOpen } from './onboarding';
import { applyTheme } from './theme';
import { checkReminder } from './reminder';
import { bookSheet, bookNameSheet, switchBook } from './subs/books';
import { budgetSheet } from './subs/budget';
import { saveAcct } from './subs/accounts';
import { renderSearchOut, filterSheet, addHistory, calToday } from './subs/views';
import { setRemoveHook } from './gestures';
import { dismissInstallTip, promptInstall, canPrompt } from '../pwa/install';
import type { Key } from '../core/expr';

/* ---------- 删除账单（左滑） ---------- */
function removeTx(id: string, row?: HTMLElement) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  const go = () => withUndo('已删除 1 笔' + (t.type === 'income' ? '收入' : t.type === 'transfer' ? '转账' : '支出'), () => { S.tx = S.tx.filter(x => x.id !== id); });
  if (row) { row.classList.add('removing'); setTimeout(go, 320); } else go();
}
setRemoveHook(removeTx);

/* ---------- 文件导出（移动端优先使用系统分享，方便存到「文件」或发给自己） ---------- */
async function deliver(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if ((e as Error).name === 'AbortError') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

function sampleClear() { withUndo('示例数据已清除', () => clearSamples(S)); }
function sampleLoad() { applySamples(S, today()); runRecurring(S, today()); save(); refresh(); toast('已载入示例数据'); }

Object.assign(ACT, {
  bookSwitch: () => bookSheet(),
  hideTip() { S.meta.sampleTip = false; save(); const tip = $('.sample-tip'); if (tip) { tip.style.transition = 'opacity .3s'; tip.style.opacity = '0'; } setTimeout(renderTab, 280); },
  transfer: (b: HTMLElement) => { if (S.accounts.length < 2) { toast('至少需要两个账户才能转账', 'warn'); return; } openRec({ type: 'transfer', acct: b.dataset.from || sortedAccounts(S)[0].id }); },
  recWithAcct: (b: HTMLElement) => openRec({ acct: b.dataset.acct }),
  editTx: (b: HTMLElement) => { const t = S.tx.find(x => x.id === b.dataset.id); t && openRec({ edit: t }); },
  copyTx: (b: HTMLElement) => { const t = S.tx.find(x => x.id === b.dataset.id); t && openRec({ copy: t }); },
  delTx: (b: HTMLElement) => { const id = b.dataset.id!; confirmSheet('删除这笔账单？', '删除后可以在提示中撤销。', '删除', () => { pop(); setTimeout(() => withUndo('已删除 1 笔账单', () => { S.tx = S.tx.filter(x => x.id !== id); }), 200); }); },
  moveBook: (b: HTMLElement) => {
    const t = S.tx.find(x => x.id === b.dataset.id); if (!t) return;
    openSheet(`<h3 tabindex="-1">移动到账本</h3><p class="d">账单会从当前账本移到所选账本</p><div class="group">${S.books.map(bk => `<button class="li" data-mv="${esc(bk.id)}"><span class="cat-ico sh0">${ico('book')}</span><span class="grow">${esc(bk.name)}</span>${bk.id === t.book ? `<span class="check">${ico('check')}</span>` : ''}</button>`).join('')}</div>`, sb => {
      $$('[data-mv]', sb).forEach(x => x.onclick = () => { if (x.dataset.mv !== t.book) { t.book = x.dataset.mv!; save(); refresh(); toast(`已移动到「${esc(S.books.find(k => k.id === t.book)!.name)}」`); } closeSheet(); });
    });
  },
  setBudget: () => budgetSheet(),
  sclear: () => { ui.search.q = ''; const el = top().el; $<HTMLInputElement>('#sq', el).value = ''; $('#sq', el).focus(); renderSearchOut(el); },
  sfilter: () => filterSheet(top().el),
  hclear: () => { const old = S.meta.history; S.meta.history = []; save(); renderSearchOut(top().el); toast('已清除搜索历史', 'ok', '撤销', () => { S.meta.history = old; save(); if (top()?.name === 'search') renderSearchOut(top().el); }); },
  calToday: () => calToday(),
  recOnDay: (b: HTMLElement) => openRec({ date: b.dataset.d }),
  saveAcct: (b: HTMLElement) => saveAcct(top().el, b.dataset.id || undefined),
  delAcct: (b: HTMLElement) => {
    const id = b.dataset.id!, a = getAcct(S, id)!; const n = S.tx.filter(t => t.acct === id || t.toAcct === id).length;
    confirmSheet(`删除「${esc(a.name)}」？`, n ? `该账户有 ${n} 笔流水，删除后这些账单会保留，但不再关联账户。` : '删除后可以在提示中撤销。', '删除账户', () => {
      pop(); if (top()?.name === 'acct') pop();
      setTimeout(() => withUndo('账户已删除', () => { S.accounts = S.accounts.filter(x => x.id !== id); S.tx.forEach(t => { if (t.acct === id) t.acct = null; if (t.toAcct === id) t.toAcct = null; }); S.recurs.forEach(r => { if (r.acct === id) r.acct = null; }); if (S.meta.lastAcct === id) S.meta.lastAcct = null; }), 200);
    });
  },
  saveCat: () => top().save?.(),
  saveRecur: () => top().save?.(),
  delCat: (b: HTMLElement) => {
    const { type, id } = b.dataset as { type: 'expense' | 'income'; id: string }; const c = getCat(S, id); const n = S.tx.filter(t => t.cat === id).length; const fb = type === 'expense' ? 'other' : 'iother';
    confirmSheet(`删除分类「${esc(c.name)}」？`, n ? `${n} 笔账单将归入「其他」。` : '这个分类还没有账单。', '删除分类', () => {
      pop();
      setTimeout(() => withUndo('分类已删除', () => { S.cats[type] = S.cats[type].filter(x => x.id !== id); S.tx.forEach(t => { if (t.cat === id) t.cat = fb; }); S.recurs.forEach(r => { if (r.cat === id) r.cat = fb; }); S.books.forEach(bk => delete bk.catBudgets[id]); }), 200);
    });
  },
  delRecur: (b: HTMLElement) => { const id = b.dataset.id!; confirmSheet('删除这条周期账单？', '已生成的账单不受影响。', '删除', () => { pop(); setTimeout(() => withUndo('周期账单已删除', () => { S.recurs = S.recurs.filter(r => r.id !== id); }), 200); }); },
  newBook: () => bookNameSheet(),
  currency: () => openSheet(`<h3 tabindex="-1">货币符号</h3><p class="d">仅影响显示，不做汇率换算</p><div class="group">${CURRENCIES.map(([s, n]) => `<button class="li" data-cur="${esc(s)}"><span class="cat-ico sh0 num" style="font-size:13px;font-weight:600">${esc(s)}</span><span class="grow">${n}</span>${S.settings.currency === s ? `<span class="check">${ico('check')}</span>` : ''}</button>`).join('')}</div>`, sb => {
    $$('[data-cur]', sb).forEach(x => x.onclick = () => { S.settings.currency = x.dataset.cur!; save(); closeSheet(); refresh(); renderAmount(); toast(`货币符号已改为 ${esc(x.dataset.cur)}`); });
  }),
  toggleRemind: () => { S.settings.remind = !S.settings.remind; S.meta.lastRemindDate = undefined; save(); refresh(); checkReminder(); toast(S.settings.remind ? `已开启 · 每天 ${S.settings.remindTime} 后打开 App 时提醒` : '已关闭每日提醒'); },
  toggleLock: () => {
    if (!S.settings.lock) showLock('set', h => { if (!h) return; persistLock(h); refresh(); toast('应用锁已开启'); });
    else showLock('verify', ok => { if (!ok) return; persistLock(null); refresh(); toast('应用锁已关闭'); });
  },
  changePin: () => showLock('verify', ok => { if (ok) setTimeout(() => showLock('set', h => { if (h) { persistLock(h); toast('密码已修改'); } }), 250); }),
  lockNow: () => showLock('unlock', () => toast('已解锁')),
  exportCSV: async () => { await flush(); if (await deliver(`小账本-${today()}.csv`, exportCSV(S), 'text/csv')) toast(`已导出 ${S.tx.length} 笔账单（CSV）`); },
  exportJSON: async () => { await flush(); if (await deliver(`小账本-备份-${today()}.json`, exportJSON(S), 'application/json')) toast('已导出 JSON 备份'); },
  import: () => $<HTMLInputElement>('#fileIn').click(),
  clearSample: () => confirmSheet('清除示例数据？', '将删除所有标记为「示例」的账单、账户、周期账单和账本，你自己记录的不受影响。', '清除', sampleClear),
  loadSample: sampleLoad,
  clearAll: () => confirmSheet('清空全部数据？', '账单、账户、周期账单、分类与账本都会恢复为空白状态，同步后云端也会一并清空；设置会保留。可以在提示中撤销。', '全部清空', () => withUndo('已清空全部数据', () => { replaceState(clearedState(S)); })),
  onboard: () => showOnboarding(),
  install: async () => {
    if (canPrompt()) { const ok = await promptInstall(); if (ok) { dismissInstallTip(); toast('已添加到主屏幕'); } refresh(); }
    else push('install');
  },
  dismissInstall: () => { dismissInstallTip(); const tip = $('.install-tip'); if (tip) { tip.style.transition = 'opacity .3s'; tip.style.opacity = '0'; } setTimeout(renderTab, 280); toast('可以随时在「我的」里找到添加方法'); },
} as Record<string, (b: HTMLElement) => void>);

const SEG: Record<string, (v: string) => void> = {
  period: v => { ui.period = v as any; ui.statSel = null; if (shiftAnchor(ui.period, periodRange(ui.period, ui.anchor, S.settings.weekStart).start, 0) > today()) ui.anchor = today(); RENDER.stats(); },
  statType: v => { ui.statType = v as any; ui.statSel = null; RENDER.stats(); },
};

export function initActions() {
  const app = $('#app');
  app.addEventListener('click', e => {
    const t = e.target as Element;
    const sb = t.closest<HTMLElement>('.seg[data-seg] button');
    if (sb) {
      const seg = sb.closest<HTMLElement>('.seg')!; if (sb.classList.contains('on')) return;
      $$('button', seg).forEach(x => { x.classList.toggle('on', x === sb); x.setAttribute('aria-selected', String(x === sb)); }); setSegKnob(seg);
      seg.dispatchEvent(new CustomEvent('segchange', { detail: sb.dataset.v, bubbles: true })); SEG[seg.dataset.seg!]?.(sb.dataset.v!); return;
    }
    if (t.closest('[data-back]')) { pop(); return; }
    const rt = t.closest<HTMLElement>('[data-rtoggle]');
    if (rt) { const r = S.recurs.find(x => x.id === rt.dataset.rtoggle); if (!r) return; r.on = !r.on; const n = r.on ? runRecurring(S, today()) : 0; save(); refresh(); toast(r.on ? (n ? `已启用，生成 ${n} 笔到期账单` : `已启用「${esc(r.name)}」`) : `已暂停「${esc(r.name)}」`); return; }
    const be = t.closest<HTMLElement>('[data-bookedit]'); if (be) { bookNameSheet(be.dataset.bookedit); return; }
    const bk = t.closest<HTMLElement>('[data-book]'); if (bk) { switchBook(bk.dataset.book!); return; }
    const del = t.closest<HTMLElement>('[data-del]'); if (del) { removeTx(del.dataset.del!, del.closest<HTMLElement>('.tx')!); return; }
    const a = t.closest<HTMLElement>('[data-act]'); if (a && ACT[a.dataset.act!]) { ACT[a.dataset.act!](a); return; }
    const go = t.closest<HTMLElement>('[data-go]'); if (go) { let p = {}; try { p = JSON.parse(go.dataset.p || '{}'); } catch { /* 忽略 */ } push(go.dataset.go!, p); return; }
    const op = t.closest<HTMLElement>('[data-open]'); if (op) { push('detail', { id: op.dataset.open }); return; }
    const mon = t.closest<HTMLButtonElement>('[data-mon]'); if (mon) { if (mon.disabled) return; ui.month = ymAdd(ui.month, +mon.dataset.mon!); if (ui.month > curYM()) ui.month = curYM(); RENDER.home(); return; }
    const pn = t.closest<HTMLButtonElement>('[data-pnav]'); if (pn) { if (pn.disabled) return; ui.anchor = shiftAnchor(ui.period, ui.anchor, +pn.dataset.pnav!); if (ui.anchor > today()) ui.anchor = today(); ui.statSel = null; RENDER.stats(); return; }
    const f = t.closest<HTMLElement>('[data-filter]'); if (f) { ui.filter = f.dataset.filter!; RENDER.home(); return; }
    const cb = t.closest<HTMLElement>('[data-catbud]'); if (cb) { budgetSheet(cb.dataset.catbud); return; }
    const dsk = t.closest<HTMLElement>('[data-due-skip]'); if (dsk) { const r = S.recurs.find(x => x.id === dsk.dataset.dueSkip); if (r) withUndo(`已跳过本期「${esc(r.name)}」`, () => { r.next = advance(r, r.next); }); return; }
    const dk = t.closest<HTMLElement>('[data-due-ok]'); if (dk) { const r = S.recurs.find(x => x.id === dk.dataset.dueOk); if (r) withUndo(`已记录 ${esc(r.name)} ${money(r.amount)}`, () => { S.tx.push(txFromRule(r, r.next)); r.next = advance(r, r.next); }); return; }
    const h = t.closest<HTMLElement>('[data-hist]'); if (h) { ui.search.q = h.dataset.hist!; const el = top().el; $<HTMLInputElement>('#sq', el).value = ui.search.q; addHistory(ui.search.q); renderSearchOut(el); return; }
    const qc = t.closest<HTMLElement>('[data-qcat]'); if (qc) { Object.assign(ui.search, { type: 'expense', cats: [qc.dataset.qcat] }); renderSearchOut(top().el); return; }
    const rg = t.closest<HTMLElement>('[data-range]'); if (rg) { const [x, y] = rg.dataset.range!.split('|'); const on = ui.search.from === x && ui.search.to === y; Object.assign(ui.search, on ? { from: '', to: '' } : { from: x, to: y }); renderSearchOut(top().el); return; }
    const st = t.closest<HTMLElement>('[data-stype]'); if (st) { ui.search.type = ui.search.type === st.dataset.stype ? 'all' : st.dataset.stype!; ui.search.cats = []; renderSearchOut(top().el); return; }
  });
  $('#mask').addEventListener('click', closeSheet);
  $('#tabbar').addEventListener('click', e => { const b = (e.target as Element).closest<HTMLElement>('.tab'); if (b) switchTab(b.dataset.tab as any); });

  document.addEventListener('keydown', e => {
    if (lockOpen()) { if (/^\d$/.test(e.key)) lockKey(e.key); else if (e.key === 'Backspace') lockKey('del'); else if (e.key === 'Escape') lockKey('cancel'); return; }
    if (e.key === 'Escape') { if (obOpen()) return; closeTop(); return; }
    const tgt = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && tgt.getAttribute?.('role') === 'button' && tgt.tagName !== 'BUTTON' && !tgt.classList.contains('tx-main')) { e.preventDefault(); tgt.click(); return; }
    if (!recOpen() || tgt.tagName === 'INPUT' || sheetOpen()) return;
    const k = /^[\d.+\-]$/.test(e.key) ? e.key : ({ Backspace: 'back', Enter: 'ok' } as Record<string, string>)[e.key];
    if (k) { e.preventDefault(); press(k as Key); }
  });

  // 导入文件
  const fileIn = $<HTMLInputElement>('#fileIn');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; fileIn.value = ''; if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast('文件太大（超过 20MB）', 'warn'); return; }
    const text = await f.text();
    try {
      if (/\.json$/i.test(f.name) || /^\s*\{/.test(text)) {
        const next = parseBackupText(text);
        confirmSheet('用备份覆盖当前数据？', `备份包含 ${next.tx.length} 笔账单、${next.accounts.length} 个账户。当前数据将被替换，可在提示中撤销。`, '覆盖导入', () => withUndo(`已导入备份 · ${next.tx.length} 笔`, () => {
          next.settings = { ...next.settings, lock: S.settings.lock, pin: S.settings.pin };
          next.meta.installTipDismissed = S.meta.installTipDismissed;
          replaceState(next); runRecurring(next, today()); applyTheme();
        }), false);
      } else {
        let r = { n: 0, newCats: 0, newAccts: 0, skipped: 0 };
        withUndo(() => `已导入 ${r.n} 笔${r.newCats ? `，新建 ${r.newCats} 个分类` : ''}${r.newAccts ? `，${r.newAccts} 个账户` : ''}${r.skipped ? `，跳过 ${r.skipped} 行` : ''}`, () => { r = importCSV(S, text); });
      }
    } catch (err) {
      toast(err instanceof ImportError ? err.message : '导入失败：文件格式不正确', 'warn');
    }
  });
}
export { closeRec };
