/** 账号会话：登录状态检查、退出登录（清除本机数据与缓存）、注销账号 */
import { flush, getSyncState, wipeLocal } from '../data/store';
import { api, ApiError, getMe, type Me } from './api';
import { pendingCount, syncNow } from './engine';

export const LOGIN_URL = '/login';
export const goLogin = (reason?: string) => location.replace(LOGIN_URL + (reason ? `?r=${encodeURIComponent(reason)}` : ''));

/** 启动时检查会话：online → /api/auth/me；离线或超时 → 使用本机记住的账号（离线可用） */
export async function checkSession(): Promise<{ me: Me | null; offline: boolean; denied: boolean }> {
  try { return { me: await getMe(6000), offline: false, denied: false }; }
  catch (e) {
    if (e instanceof ApiError && e.status === 401) return { me: null, offline: false, denied: true };
    return { me: null, offline: true, denied: false };
  }
}

/** 退出登录：先尽量同步，再让服务端会话失效，最后清除本机全部数据与缓存 */
export async function logout(opts: { force?: boolean } = {}): Promise<{ ok: boolean; pending?: number; error?: string }> {
  await flush();
  if (!opts.force) {
    if (!navigator.onLine) return { ok: false, error: '退出登录需要联网，以便让本设备的登录凭证失效' };
    await syncNow();
    const n = await pendingCount();
    if (n) return { ok: false, pending: n };
  }
  try { await api('POST', '/api/auth/logout', {}); }
  catch (e) { if (!opts.force && !(e instanceof ApiError)) return { ok: false, error: '网络连接失败，请稍后再试' }; }
  await wipeLocal();
  goLogin('logout');
  return { ok: true };
}

export async function changePassword(current: string, next: string) { return api<{ ok: boolean; revoked: number }>('POST', '/api/auth/password', { current, next }); }
export async function revokeOthers() { return api<{ revoked: number }>('POST', '/api/auth/sessions/revoke-others', {}); }
export async function deleteAccount(password: string) {
  await api('DELETE', '/api/account', { password });
  await wipeLocal();
  goLogin('deleted');
}
export const currentEmail = async () => (await getSyncState())?.email ?? '';
