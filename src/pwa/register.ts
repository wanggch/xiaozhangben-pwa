/** Service Worker 注册与「新版本可用」提示 */
import { registerSW } from 'virtual:pwa-register';
import { $ } from '../ui/dom';
import { toast } from '../ui/app';

export function initSW() {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { showUpdateBanner(() => updateSW(true)); },
    onOfflineReady() { if (document.getElementById('ob')?.classList.contains('hide')) toast('已可离线使用'); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // 每小时、以及回到前台时检查一次更新
      const check = () => { if (navigator.onLine) reg.update().catch(() => { /* 离线 */ }); };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    },
  });
}

function showUpdateBanner(apply: () => void) {
  const b = $('#banner');
  b.innerHTML = `<div class="grow">发现新版本<small>刷新后即可使用，数据不受影响</small></div><button class="x" data-x aria-label="稍后">稍后</button><button data-ok>立即刷新</button>`;
  b.classList.add('show'); b.setAttribute('aria-hidden', 'false');
  $('[data-ok]', b).onclick = () => { b.classList.remove('show'); apply(); };
  $('[data-x]', b).onclick = () => { b.classList.remove('show'); b.setAttribute('aria-hidden', 'true'); };
}
