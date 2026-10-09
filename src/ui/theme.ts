import { S } from '../data/store';
const mq = matchMedia('(prefers-color-scheme: dark)');
export const THEME_KEY = 'xzb-theme';
export function applyTheme() {
  const pref = S.settings.theme;
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // 状态栏 / 地址栏颜色跟随主题
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = dark ? '#0B0B0D' : '#F6F6F4'; document.head.appendChild(meta);
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* 隐私模式 */ }
}
mq.addEventListener?.('change', () => { if (S.settings.theme === 'auto') applyTheme(); });
