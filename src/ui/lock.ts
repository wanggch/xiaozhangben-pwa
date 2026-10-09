/** 应用锁界面：设置 / 验证 / 解锁 */
import { S, save } from '../data/store';
import { openSheet, closeSheet, toast } from './app';
import { logout } from '../sync/session';
import { $, $$, vibrate } from './dom';
import { ico } from './icons';
import { hashPin, lockoutMs, verifyPin } from '../core/pin';
import type { PinHash } from '../core/types';

type Mode = 'unlock' | 'set' | 'verify';
const st = { mode: null as Mode | null, buf: '', first: '', busy: false, cb: null as null | ((v: any) => void) };
const FAIL_KEY = 'xzb-lock-fails';
const fails = () => { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{"n":0,"t":0}') as { n: number; t: number }; } catch { return { n: 0, t: 0 }; } };
const setFails = (v: { n: number; t: number }) => { try { localStorage.setItem(FAIL_KEY, JSON.stringify(v)); } catch { /* 忽略 */ } };
let cooldownTimer: number | undefined;

export const lockOpen = () => !!st.mode;
export function showLock(mode: Mode, cb?: (v: any) => void) {
  Object.assign(st, { mode, buf: '', first: '', busy: false, cb: cb || null });
  const L = $('#lock');
  const title = { unlock: '输入密码', set: '设置 4 位密码', verify: '验证当前密码' }[mode];
  L.innerHTML = `<div class="lock-ico">${ico('lock')}</div><h3 id="lkT">${title}</h3><p id="lkS" aria-live="assertive">${mode === 'unlock' ? '小账本已锁定' : mode === 'set' ? '用于打开 App 时解锁' : '请输入当前密码'}</p>
    <div class="pin" id="pin" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="lock-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => `<button data-n="${n}" aria-label="${n}">${n}</button>`).join('')}<button class="txt" data-n="${mode === 'unlock' ? 'forgot' : 'cancel'}">${mode === 'unlock' ? '忘记密码' : '取消'}</button><button data-n="0" aria-label="0">0</button><button class="txt" data-n="del" aria-label="删除">${ico('back')}</button></div>`;
  L.classList.add('show'); L.setAttribute('aria-hidden', 'false'); L.setAttribute('role', 'dialog'); L.setAttribute('aria-modal', 'true'); L.setAttribute('aria-labelledby', 'lkT');
  ['#root', '#subs', '#rec'].forEach(q => $(q).setAttribute('inert', '')); $('#app').classList.add('locked');
  $('.lock-pad', L).onclick = e => { const b = (e.target as Element).closest<HTMLElement>('button'); if (b) lockKey(b.dataset.n!); };
  if (mode === 'unlock') checkCooldown();
}
export function hideLock() {
  const L = $('#lock'); L.classList.remove('show'); L.setAttribute('aria-hidden', 'true'); st.mode = null;
  ['#root', '#subs', '#rec'].forEach(q => $(q).removeAttribute('inert')); $('#app').classList.remove('locked');
}
function checkCooldown(): boolean {
  const f = fails(); const left = f.t - Date.now();
  if (left > 0) {
    const sub = $('#lkS'); sub.classList.add('err'); sub.textContent = `尝试次数过多，请 ${Math.ceil(left / 1000)} 秒后再试`;
    clearTimeout(cooldownTimer); cooldownTimer = window.setTimeout(() => { if (st.mode === 'unlock') { if (!checkCooldown()) { sub.classList.remove('err'); sub.textContent = '小账本已锁定'; } } }, 1000);
    return true;
  }
  return false;
}
function dots() { $$('#pin i').forEach((d, i) => d.classList.toggle('on', i < st.buf.length)); }
export async function lockKey(n: string) {
  if (!st.mode || st.busy) return;
  const pin = $('#pin'), sub = $('#lkS');
  if (n === 'cancel') { const cb = st.cb; hideLock(); cb?.(false); return; }
  if (n === 'forgot') { forgotSheet(); return; }
  if ((st.mode === 'unlock' || st.mode === 'verify') && checkCooldown()) return;
  if (n === 'del') st.buf = st.buf.slice(0, -1);
  else if (st.buf.length < 4) { st.buf += n; vibrate(6); }
  dots(); pin.classList.remove('err'); sub.classList.remove('err');
  if (st.buf.length < 4) return;
  const v = st.buf;
  const fail = (msg: string) => setTimeout(() => { pin.classList.add('err'); sub.textContent = msg; sub.classList.add('err'); st.buf = ''; dots(); vibrate(30); }, 120);
  if (st.mode === 'unlock' || st.mode === 'verify') {
    st.busy = true; const ok = await verifyPin(v, S.settings.pin); st.busy = false;
    if (ok) { setFails({ n: 0, t: 0 }); setTimeout(() => { const cb = st.cb; hideLock(); cb?.(true); }, 150); }
    else {
      const f = fails(); f.n++; const ms = lockoutMs(f.n); f.t = ms ? Date.now() + ms : 0; setFails(f);
      fail(ms ? `密码错误，请 ${Math.ceil(ms / 1000)} 秒后再试` : `密码错误，还可尝试 ${5 - f.n} 次`);
      if (ms) setTimeout(checkCooldown, 1200);
    }
  } else if (st.mode === 'set') {
    if (!st.first) { st.first = v; st.buf = ''; setTimeout(() => { $('#lkT').textContent = '再次输入确认'; sub.textContent = '两次输入需一致'; dots(); }, 160); }
    else if (v === st.first) {
      st.busy = true; const h: PinHash = await hashPin(v); st.busy = false; st.first = '';
      setTimeout(() => { const cb = st.cb; hideLock(); cb?.(h); }, 150);
    } else { st.first = ''; fail('两次输入不一致，请重新设置'); setTimeout(() => $('#lkT').textContent = '设置 4 位密码', 130); }
  }
}
function forgotSheet() {
  openSheet(`<h3 tabindex="-1">忘记密码？</h3><p class="d">应用锁密码只保存在这台设备上（加盐哈希），无法找回。<br/>可以<b>退出登录并清除本机数据</b>，然后用账号重新登录，账本会从云端恢复（尚未同步的修改会丢失）。</p>
    <div class="btns"><button class="btn ghost" data-x>再想想</button><button class="btn danger" data-ok>退出并清除</button></div>`, b => {
    $('[data-x]', b).onclick = closeSheet;
    $('[data-ok]', b).onclick = () => {
      closeSheet(); setFails({ n: 0, t: 0 });
      toast('正在退出登录…');
      void logout({ force: true });
    };
  });
}

/* 启动与回到前台时的锁定 */
let hiddenAt = 0;
export const LOCK_AFTER_MS = 60_000;
export function initAutoLock() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (S.settings.lock && S.settings.pin && !lockOpen() && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) showLock('unlock');
  });
}
export const persistLock = (h: PinHash | null) => { S.settings.lock = !!h; S.settings.pin = h; save(); };
