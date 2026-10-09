import './styles/proto.css';
import './styles/app.css';
import { load, save, S, onExternalChange, requestPersist, flush, getSyncState, setSyncState, wipeLocal } from './data/store';
import { RENDER, ui, refresh, toast, initHistory, setLayerHooks, setApplyThemeHook, initSegs, openSheet, closeSheet } from './ui/app';
import './ui/pages/home';
import './ui/pages/stats';
import './ui/pages/assets';
import './ui/pages/me';
import './ui/subs/views';
import './ui/subs/budget';
import './ui/subs/accounts';
import './ui/subs/cats';
import './ui/subs/recurs';
import './ui/subs/books';
import './ui/subs/settings';
import { loadAccountInfo } from './ui/subs/account';
import { checkSession, goLogin } from './sync/session';
import { adoptCloud, adoptLocal, onSyncChange, setApplyHook, startAutoSync, sync, syncNow } from './sync/engine';
import { hasUserData } from './sync/records';
import { emptyState } from './core/defaults';
import type { Me } from './sync/api';
import { initActions } from './ui/actions';
import { initRecord, renderCats, renderAmount, recOpen, closeRec, openRec } from './ui/record';
import { initEdgeBack } from './ui/gestures';
import { lockOpen, showLock, initAutoLock } from './ui/lock';
import { showOnboarding } from './ui/onboarding';
import { applyTheme } from './ui/theme';
import { checkReminder } from './ui/reminder';
import { runRecurring } from './core/recurring';
import { curYM, today } from './core/dates';
import { initInstall, isStandalone, onInstallChange } from './pwa/install';
import { initSW } from './pwa/register';
import { $ } from './ui/dom';

/** 首次在本设备登录：决定以本机还是云端为准 */
function firstSync(me: Me): Promise<void> {
  const st = { userId: me.user.id, email: me.user.email, cursor: 0, lastSyncAt: null };
  const local = hasUserData(S, emptyState()), cloud = me.sync.records > 0;
  const run = async (f: () => Promise<void>, msg: string) => {
    toast(msg);
    try { await f(); refresh(); applyTheme(); toast(sync.status === 'ok' ? '同步完成' : '暂时无法同步，联网后会自动重试', sync.status === 'ok' ? 'ok' : 'warn'); }
    catch { toast('同步失败，稍后会自动重试', 'warn'); }
  };
  if (!local && cloud) return run(() => adoptCloud(st), '正在从云端恢复数据…');
  if (!cloud) return run(async () => { await setSyncState(st); await syncNow(); }, local ? '正在上传本机数据…' : '正在同步…');
  return new Promise(res => {
    let chosen = false;
    openSheet(`<h3 tabindex="-1">本机已有账本数据</h3><p class="d">云端也已经有 ${me.sync.records} 条记录。请选择以哪一边为准：</p>
      <div class="choice"><button class="li" data-c="local"><span class="grow">上传本机数据<span class="sm">以本机为准，覆盖云端（云端多出的记录会被删除）</span></span></button>
      <button class="li" data-c="cloud"><span class="grow">用云端数据覆盖<span class="sm">以云端为准，清除本机现有数据</span></span></button></div>
      <p class="d" style="margin-top:12px">不确定时，可以先在「设置 → 导出 JSON 备份」保存本机数据。</p>`, b => {
      b.querySelectorAll<HTMLElement>('[data-c]').forEach(btn => btn.onclick = () => {
        chosen = true; closeSheet();
        const f = btn.dataset.c === 'local' ? () => adoptLocal(st) : () => adoptCloud(st);
        void run(f, btn.dataset.c === 'local' ? '正在上传本机数据…' : '正在从云端恢复数据…').then(() => res());
      });
    }, () => { if (!chosen) { toast('未选择，暂不同步；下次打开时会再询问', 'warn'); res(); } });
  });
}

async function boot() {
  initInstall();
  await load();
  // ---- 账号：未登录只能看到登录页；登录过的设备离线时可直接使用本机数据 ----
  const st0 = await getSyncState();
  const sess = await checkSession();
  if (sess.denied) { goLogin('expired'); return; }
  if (!sess.me && !st0) { goLogin(); return; }
  let firstMe: Me | null = null;
  if (sess.me) {
    if (st0 && st0.userId !== sess.me.user.id) { await wipeLocal(); location.reload(); return; } // 换了账号：先清除上一个账号的本机数据
    if (!st0) firstMe = sess.me;
    else if (st0.email !== sess.me.user.email) await setSyncState({ ...st0, email: sess.me.user.email });
  }
  await loadAccountInfo();
  if (st0) sync.lastSyncAt = st0.lastSyncAt;
  setApplyHook(() => { applyTheme(); refresh(); });
  let authWarned = false;
  onSyncChange(() => { if (sync.status === 'auth' && !authWarned) { authWarned = true; toast('登录已失效，请重新登录', 'warn', '重新登录', () => goLogin('expired')); } });

  applyTheme(); setApplyThemeHook(applyTheme);
  setLayerHooks({ recOpen, closeRec, lockOpen });
  initHistory(); initRecord(); initActions(); initEdgeBack(); initAutoLock();

  const generated = runRecurring(S, today()); if (generated) save();
  renderCats(); renderAmount(); RENDER.home();
  $('#app').classList.remove('booting');
  // 主屏幕快捷方式「记一笔」：manifest shortcuts → /?action=record（读取后立即从地址栏移除）
  const quick = new URLSearchParams(location.search).get('action') === 'record';
  if (quick) history.replaceState(history.state, '', location.pathname);
  const openQuick = () => { if (quick && S.meta.onboarded) setTimeout(() => openRec(), 250); };
  if (firstMe) { await firstSync(firstMe); await loadAccountInfo(); RENDER.home(); }
  if (S.settings.lock && S.settings.pin) showLock('unlock', openQuick);
  else if (!S.meta.onboarded) showOnboarding();
  else openQuick();
  startAutoSync();
  if (generated) setTimeout(() => toast(`已自动生成 ${generated} 笔周期账单`), 700);
  checkReminder();
  if (isStandalone()) requestPersist();

  // 跨过午夜 / 回到前台：重新计算「今天」，补齐到期周期账单
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flush(); return; }
    const T = today();
    if (T !== lastDay) {
      if (ui.month === lastDay.slice(0, 7)) ui.month = curYM();
      if (ui.anchor === lastDay) ui.anchor = T;
      lastDay = T;
      const n = runRecurring(S, T); if (n) { save(); toast(`已自动生成 ${n} 笔周期账单`); }
      refresh();
    }
    checkReminder();
  });
  addEventListener('pagehide', () => { flush(); });
  // 其他标签页修改了数据
  onExternalChange(() => { applyTheme(); refresh(); });
  onInstallChange(() => { if (ui.tab === 'home') RENDER.home(); });
  addEventListener('resize', () => initSegs(document));
  window.addEventListener('online', () => document.documentElement.classList.remove('is-offline'));
  window.addEventListener('offline', () => document.documentElement.classList.add('is-offline'));
  initSW();
}
boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:40px 24px;font:15px/1.7 system-ui;color:#16161A">小账本启动失败：${String(err?.message || err).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}<br/>请刷新重试。</div>`;
});
