/** 后端 API 客户端：同源 + Cookie 会话；JSON 请求自动带 Origin（浏览器行为），用于服务端 CSRF 校验 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = null) { super(message); }
}
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export async function api<T = any>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store', signal: ctl.signal,
      headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error || `请求失败（${res.status}）`, data);
    return data as T;
  } finally { clearTimeout(timer); }
}

export interface Me { user: { id: number; email: string; createdAt: number }; sync: { head: number; records: number; tombstones: number } }
export const getMe = (timeoutMs?: number) => api<Me>('GET', '/api/auth/me', undefined, timeoutMs);
