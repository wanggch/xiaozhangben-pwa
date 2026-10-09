/** 添加到主屏幕：捕获 beforeinstallprompt（安卓/桌面 Chrome），iOS 给出图文引导 */
import { S, save } from '../data/store';
import { ico } from '../ui/icons';

let deferred: any = null;
const listeners = new Set<() => void>();
export function initInstall() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()); });
  addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}
export const onInstallChange = (f: () => void) => listeners.add(f);
export const canPrompt = () => !!deferred;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null;
  listeners.forEach(f => f());
  return r?.outcome === 'accepted';
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as any).standalone === true;
const ua = () => navigator.userAgent;
export const isIOS = () => /iP(hone|od|ad)/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua());
export const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQ\//i.test(ua());
export const isWeChat = () => /MicroMessenger/i.test(ua());

/** 首页上的轻提示卡片 */
export function installTipHTML() {
  if (isStandalone() || S.meta.installTipDismissed || !S.meta.onboarded) return '';
  if (!(canPrompt() || isIOS() || isAndroid())) return '';
  return `<div class="due install-tip"><span class="cat-ico sh1">${ico('phone')}</span><div><div class="t">添加到主屏幕</div><div class="s">像 App 一样全屏打开，离线也能记账</div></div>
    <div class="acts"><button class="mini-btn" data-act="dismissInstall">不用了</button><button class="mini-btn pri" data-act="install">添加</button></div></div>`;
}
export function dismissInstallTip() { S.meta.installTipDismissed = true; save(); }
