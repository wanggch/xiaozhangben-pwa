/** 账号与同步：账号信息、同步状态、手动同步、修改密码、退出其他设备、退出登录、注销账号 */
import { getSyncState } from '../../data/store';
import { SUB, ACT, openSheet, closeSheet, toast, confirmSheet } from '../app';
import { $, esc } from '../dom';
import { ico } from '../icons';
import { sync, syncNow, onSyncChange, pendingCount } from '../../sync/engine';
import { changePassword, deleteAccount, logout, revokeOthers } from '../../sync/session';
import { ApiError } from '../../sync/api';

let email = '';
export async function loadAccountInfo() { email = (await getSyncState())?.email ?? ''; }
export const accountEmail = () => email;

export function syncLabel(): string {
  switch (sync.status) {
    case 'syncing': return '正在同步…';
    case 'offline': return sync.pending ? `离线 · ${sync.pending} 项待同步` : '离线';
    case 'error': return '同步失败';
    case 'auth': return '需要重新登录';
    default: return sync.lastSyncAt ? (sync.pending ? `${sync.pending} 项待同步` : '已同步') : '尚未同步';
  }
}
export function lastSyncText(): string {
  if (!sync.lastSyncAt) return '从未';
  const d = new Date(sync.lastSyncAt), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
const dotCls = () => sync.status === 'ok' && !sync.pending ? 'ok' : sync.status === 'error' || sync.status === 'auth' ? 'err' : sync.status === 'syncing' ? 'busy' : 'idle';

SUB.account = () => {
  const li = (icon: string, name: string, rv: string, attr = '', cls = '') => `<button class="li ${cls}" ${attr}>${ico(icon)}<span class="grow">${name}</span><span class="rv">${rv}</span></button>`;
  return {
    title: '账号与同步', body: `
    <div class="card acct-card" style="margin-top:8px">
      <div class="profile"><div class="avatar" aria-hidden="true">${esc((email[0] || '我').toUpperCase())}</div><div><h2 class="acct-email">${esc(email)}</h2><p>数据保存在本机，并通过 HTTPS 同步到你的服务器</p></div></div>
    </div>
    <div class="group-t"><span>云同步</span></div>
    <div class="group" id="syncBox">
      <div class="li">${ico('cloud')}<span class="grow">同步状态<span class="sm" id="syncErr">${esc(sync.error)}</span></span><span class="rv"><i class="sync-dot ${dotCls()}" aria-hidden="true"></i><span id="syncLbl" data-testid="sync-status">${syncLabel()}</span></span></div>
      <div class="li">${ico('clock')}<span class="grow">上次同步</span><span class="rv" id="syncTime">${lastSyncText()}</span></div>
      ${li('refresh', '立即同步', ico('right'), 'data-act="syncNow"')}
    </div>
    <div class="group-t"><span>安全</span></div>
    <div class="group">
      ${li('key', '修改登录密码', ico('right'), 'data-act="changePassword"')}
      ${li('users', '退出其他设备', ico('right'), 'data-act="revokeOthers"')}
    </div>
    <div class="group">
      ${li('logout', '退出登录', '', 'data-act="logout"')}
      ${li('trash', '注销账号', '', 'data-act="deleteAccount"', 'danger')}
    </div>
    <div class="hint" style="margin-top:24px">应用锁密码只保存在本机，不会同步<br/>退出登录会清除本机账本数据与离线缓存</div>`,
    mount(el) {
      const upd = () => {
        if (!el.isConnected) { off(); return; }
        $('#syncLbl', el).textContent = syncLabel(); $('#syncTime', el).textContent = lastSyncText(); $('#syncErr', el).textContent = sync.error;
        $('.sync-dot', el).className = `sync-dot ${dotCls()}`;
      };
      const off = onSyncChange(upd);
      void pendingCount().then(n => { sync.pending = n; upd(); });
    },
  };
};

const field = (id: string, label: string, type = 'password', auto = 'current-password') =>
  `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" autocomplete="${auto}" maxlength="256"/></div>`;
const err = (b: HTMLElement, msg: string) => { const e = $('.form-err', b); e.textContent = msg; e.hidden = !msg; };
const busy = (btn: HTMLButtonElement, on: boolean, text: string) => { btn.disabled = on; btn.textContent = on ? '请稍候…' : text; };
const msgOf = (e: unknown) => e instanceof ApiError ? e.message : '网络连接失败，请检查网络后重试';

Object.assign(ACT, {
  syncNow: async () => {
    if (!navigator.onLine) { toast('当前离线，联网后会自动同步', 'warn'); return; }
    await syncNow();
    if (sync.status === 'ok') toast('同步完成'); else if (sync.status === 'auth') toast('登录已失效，请重新登录', 'warn'); else toast(sync.error || '同步失败', 'warn');
  },
  changePassword: () => openSheet(`<h3 tabindex="-1">修改登录密码</h3><p class="d">修改后其他设备需要重新登录。</p>
    ${field('pwCur', '当前密码')}${field('pwNew', '新密码（至少 8 位）', 'password', 'new-password')}${field('pwNew2', '再次输入新密码', 'password', 'new-password')}
    <p class="form-err" role="alert" hidden></p><div class="btns"><button class="btn ghost" data-x>取消</button><button class="btn" data-ok>确认修改</button></div>`, b => {
    $('[data-x]', b).onclick = closeSheet;
    const ok = $<HTMLButtonElement>('[data-ok]', b);
    ok.onclick = async () => {
      const cur = $<HTMLInputElement>('#pwCur', b).value, n1 = $<HTMLInputElement>('#pwNew', b).value, n2 = $<HTMLInputElement>('#pwNew2', b).value;
      if (!cur) return err(b, '请输入当前密码');
      if (n1.length < 8) return err(b, '新密码至少 8 位');
      if (n1 !== n2) return err(b, '两次输入的新密码不一致');
      busy(ok, true, '确认修改');
      try { const r = await changePassword(cur, n1); closeSheet(); toast(r.revoked ? `密码已修改，${r.revoked} 台其他设备已退出` : '密码已修改'); }
      catch (e) { err(b, msgOf(e)); busy(ok, false, '确认修改'); }
    };
  }),
  revokeOthers: () => confirmSheet('退出其他设备？', '除当前设备外，所有已登录的设备都需要重新登录。', '全部退出', async () => {
    try { const r = await revokeOthers(); toast(r.revoked ? `已退出 ${r.revoked} 台设备` : '没有其他已登录的设备'); } catch (e) { toast(msgOf(e), 'warn'); }
  }, false),
  logout: () => confirmSheet('退出登录？', '退出前会先同步；退出后本机的账本数据和离线缓存会被清除，重新登录后从云端恢复。', '退出登录', async () => {
    toast('正在同步并退出…');
    const r = await logout();
    if (r.ok) return;
    if (r.pending) confirmSheet('有修改尚未同步', `还有 ${r.pending} 项修改没有同步到云端（${esc(sync.error || '同步失败')}）。仍然退出会丢失这些修改。`, '仍然退出', () => void logout({ force: true }));
    else toast(r.error || '退出失败', 'warn');
  }, false),
  deleteAccount: () => openSheet(`<h3 tabindex="-1">注销账号</h3><p class="d">将<b>永久删除</b>云端的全部账本数据和这个账号，并清除本机数据。此操作无法撤销，建议先在设置中导出 JSON 备份。</p>
    ${field('delPw', '输入登录密码确认')}
    <p class="form-err" role="alert" hidden></p><div class="btns"><button class="btn ghost" data-x>取消</button><button class="btn danger" data-ok>永久注销</button></div>`, b => {
    $('[data-x]', b).onclick = closeSheet;
    const ok = $<HTMLButtonElement>('[data-ok]', b);
    ok.onclick = async () => {
      const pw = $<HTMLInputElement>('#delPw', b).value; if (!pw) return err(b, '请输入密码');
      busy(ok, true, '永久注销');
      try { await deleteAccount(pw); } catch (e) { err(b, msgOf(e)); busy(ok, false, '永久注销'); }
    };
  }),
});
