/**
 * 每日记账提醒
 * PWA 目前无法在 App 关闭时可靠地定时推送通知（iOS 不支持后台定时，Notification Triggers 已被浏览器放弃，
 * Periodic Background Sync 只在安卓 Chrome 安装后按浏览器策略不定时触发）。
 * 因此采用应用内提醒：到点后只要打开或切回 App，就在应用内提示一次；App 开着时到点也会提示。
 */
import { S, save } from '../data/store';
import { toast } from './app';
import { pad, today } from '../core/dates';

let timer: number | undefined;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function checkReminder() {
  clearTimeout(timer);
  if (!S.settings.remind) return;
  const T = today();
  if (S.meta.lastRemindDate !== T && nowHM() >= S.settings.remindTime && !S.tx.some(t => t.date === T && t.book === S.meta.curBook)) {
    S.meta.lastRemindDate = T; save();
    setTimeout(() => toast('今天还没记账哦，花一分钟记一下吧', 'warn'), 1200);
  }
  // App 开着时，到点再检查一次
  const [h, m] = S.settings.remindTime.split(':').map(Number); const at = new Date(); at.setHours(h, m, 5, 0);
  const ms = at.getTime() - Date.now();
  if (ms > 0 && ms < 864e5) timer = window.setTimeout(checkReminder, ms);
}
