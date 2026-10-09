import './styles/proto.css';
import './styles/app.css';
import { load, save, S, onExternalChange, requestPersist, flush } from './data/store';
import { RENDER, ui, refresh, toast, initHistory, setLayerHooks, setApplyThemeHook, initSegs } from './ui/app';
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

async function boot() {
  initInstall();
  await load();
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
  if (S.settings.lock && S.settings.pin) showLock('unlock', openQuick);
  else if (!S.meta.onboarded) showOnboarding();
  else openQuick();
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
