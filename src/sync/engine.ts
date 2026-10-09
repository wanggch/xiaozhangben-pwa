/**
 * 云同步引擎（离线优先）：
 * - 本机 IndexedDB 是主存储；同步基线（syncbase）记录每条记录最后一次与云端一致的 JSON
 * - 推送：当前状态与基线不同的记录（新增 / 修改 / 删除→墓碑）
 * - 拉取：按服务端单调序列号增量获取；本机有未推送修改的记录跳过（随后推送，后到者胜）
 * - 冲突：记录级 last-write-wins，以服务端接收时间为准
 * - 触发：启动、联网恢复、本地修改后防抖、定时、回到前台、手动
 * - 多标签页：用 Web Locks 串行化
 */
import { S, save, flush, getSyncState, setSyncState, loadSyncBase, writeSyncBase, onLocalChange, type SyncState } from '../data/store';
import { defaultBook } from '../core/defaults';
import { api, ApiError, isNetworkError } from './api';
import { applyRemote, keyOf, repairState, toRecords, type Kind, type RemoteChange } from './records';

export type Status = 'idle' | 'syncing' | 'ok' | 'offline' | 'error' | 'auth';
export const sync = { status: 'idle' as Status, lastSyncAt: null as number | null, error: '', pending: 0 };
const listeners = new Set<() => void>();
export const onSyncChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
let applyHook: () => void = () => { /* 注入：刷新界面 */ };
export const setApplyHook = (f: () => void) => { applyHook = f; };
const emit = () => listeners.forEach(f => f());
const set = (p: Partial<typeof sync>) => { Object.assign(sync, p); emit(); };

const PUSH_BATCH = 400;
let running: Promise<void> | null = null; let again = false;

/** 本机尚未推送的修改条数 */
export async function pendingCount(): Promise<number> {
  const base = await loadSyncBase(); const cur = toRecords(S); let n = 0;
  for (const [k, r] of cur) if (base.get(k) !== r.json) n++;
  for (const k of base.keys()) if (!cur.has(k)) n++;
  return n;
}

export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await withLock(runOnce); } while (again);
    } finally { running = null; }
  })();
  return running;
}

async function withLock(fn: () => Promise<void>) {
  const locks = (navigator as any).locks;
  if (locks?.request) return locks.request('xzb-sync', fn);
  return fn();
}

async function runOnce() {
  const st = await getSyncState(); if (!st) return;
  if (!navigator.onLine) { set({ status: 'offline', pending: await pendingCount() }); return; }
  set({ status: 'syncing' });
  try {
    await flush();
    await pushAll(st);
    const applied = await pullAll(st);
    st.lastSyncAt = Date.now(); await setSyncState(st);
    set({ status: 'ok', lastSyncAt: st.lastSyncAt, error: '', pending: await pendingCount() });
    if (applied) applyHook();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) set({ status: 'auth', error: '登录已失效，请重新登录' });
    else if (isNetworkError(e)) set({ status: 'offline', error: '' });
    else set({ status: 'error', error: (e as Error).message });
    sync.pending = await pendingCount().catch(() => sync.pending);
    emit();
  }
}

async function pushAll(_st: SyncState) {
  const base = await loadSyncBase(); const cur = toRecords(S);
  const changes: { kind: Kind; id: string; deleted: boolean; data?: unknown; json: string | null }[] = [];
  for (const [k, r] of cur) if (base.get(k) !== r.json) changes.push({ kind: r.kind, id: r.id, deleted: false, data: r.data, json: r.json });
  for (const k of base.keys()) if (!cur.has(k)) { const i = k.indexOf(':'); changes.push({ kind: k.slice(0, i) as Kind, id: k.slice(i + 1), deleted: true, json: null }); }
  // 先推送分类、账户、账本，再推送账单（其他设备拉取时引用关系更完整）
  const rank: Record<Kind, number> = { settings: 0, book: 1, account: 2, cat: 3, recur: 4, tx: 5 };
  changes.sort((a, b) => rank[a.kind] - rank[b.kind]);
  for (let i = 0; i < changes.length; i += PUSH_BATCH) {
    const batch = changes.slice(i, i + PUSH_BATCH);
    await api('POST', '/api/sync/push', { changes: batch.map(({ json: _j, ...c }) => c) });
    await writeSyncBase(new Map(batch.map(c => [keyOf(c.kind, c.id), c.json])));
  }
}

async function pullAll(st: SyncState): Promise<boolean> {
  let applied = false;
  for (;;) {
    const res = await api<{ changes: RemoteChange[]; cursor: number; head: number; hasMore: boolean }>('GET', `/api/sync/pull?since=${st.cursor}&limit=1000`);
    if (res.head < st.cursor) { st.cursor = 0; await writeSyncBase(new Map(), true); continue; } // 服务端数据被重置：全量重拉
    if (res.changes.length) {
      const base = await loadSyncBase(); const cur = toRecords(S);
      const touched: string[] = [];
      for (const c of res.changes) {
        const k = keyOf(c.kind, c.id);
        // 本机有尚未推送的修改：跳过，稍后推送（后到服务端者胜）
        if ((cur.get(k)?.json ?? null) !== (base.get(k) ?? null)) continue;
        applyRemote(S, c); touched.push(k); applied = true;
      }
      if (touched.length) {
        repairState(S, defaultBook);
        save(); await flush();
        const after = toRecords(S);
        await writeSyncBase(new Map(touched.map(k => [k, after.get(k)?.json ?? null])));
      }
    }
    st.cursor = res.cursor; await setSyncState(st);
    if (!res.hasMore) break;
  }
  return applied;
}

/* ---------- 首次在本设备登录 ---------- */

/** 以云端为准：清空本机账本，全量拉取 */
export async function adoptCloud(st: SyncState) {
  S.tx = []; S.accounts = []; S.books = []; S.recurs = []; S.cats = { expense: [], income: [] };
  st.cursor = 0; await setSyncState(st);
  // 基线 = 清空后的本机状态（只剩设置），这样云端的设置等记录不会被当成本机冲突而跳过
  await writeSyncBase(new Map([...toRecords(S)].map(([k, r]) => [k, r.json])), true);
  set({ status: 'syncing' });
  await pullAll(st);
  repairState(S, defaultBook); save(); await flush();
  st.lastSyncAt = Date.now(); await setSyncState(st);
  set({ status: 'ok', lastSyncAt: st.lastSyncAt, pending: await pendingCount() });
}

/** 以本机为准：把云端现有记录作为基线（于是云端独有的记录会被删除、不同的会被覆盖），再正常同步 */
export async function adoptLocal(st: SyncState) {
  const base = new Map<string, string | null>(); let since = 0;
  for (;;) {
    const res = await api<{ changes: RemoteChange[]; cursor: number; hasMore: boolean }>('GET', `/api/sync/pull?since=${since}&limit=2000`);
    for (const c of res.changes) base.set(keyOf(c.kind, c.id), c.deleted ? null : JSON.stringify(c.data));
    since = res.cursor; if (!res.hasMore) break;
  }
  await writeSyncBase(base, true);
  st.cursor = since; await setSyncState(st);
  await syncNow();
}

/* ---------- 自动触发 ---------- */
let debounce: number | undefined; let started = false;
export function startAutoSync() {
  if (started) return; started = true;
  onLocalChange(() => { clearTimeout(debounce); debounce = window.setTimeout(() => void syncNow(), 1500); });
  addEventListener('online', () => void syncNow());
  addEventListener('offline', () => set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
  setInterval(() => { if (!document.hidden) void syncNow(); }, 60_000);
  void syncNow();
}
