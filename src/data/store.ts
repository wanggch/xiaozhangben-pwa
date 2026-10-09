/**
 * 内存中的状态 + IndexedDB 持久化
 * 所有页面读同一个内存状态 S；修改后调用 save()，会在微任务中把变化的记录写入 IndexedDB（单个事务）。
 */
import type { State } from '../core/types';
import { emptyState } from '../core/defaults';
import { COLLECTIONS, DATA_VERSION, migrateData, openLedgerDB, type Collection, type DB } from './db';

export let S: State = emptyState();
let db: DB | null = null;
let memoryOnly = false;
const saved: Record<Collection, Map<string, string>> = { tx: new Map(), accounts: new Map(), books: new Map(), recurs: new Map() };
const savedKV = new Map<string, string>();
let pending = false; let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

export const isMemoryOnly = () => memoryOnly;
export function onExternalChange(fn: () => void) { listeners.add(fn); }

async function readAll(d: DB) {
  const [tx, accounts, books, recurs, kvRows] = await Promise.all([d.getAll('tx'), d.getAll('accounts'), d.getAll('books'), d.getAll('recurs'), d.getAll('kv')]);
  const kv: Record<string, any> = {}; kvRows.forEach(r => kv[r.key] = r.value);
  return { tx, accounts, books, recurs, kv };
}

function hydrate(raw: Awaited<ReturnType<typeof readAll>>): State {
  const base = emptyState();
  return {
    tx: raw.tx, accounts: raw.accounts, books: raw.books.length ? raw.books : base.books, recurs: raw.recurs,
    cats: raw.kv.cats || base.cats, settings: { ...base.settings, ...(raw.kv.settings || {}) }, meta: { ...base.meta, ...(raw.kv.meta || {}) },
  };
}

function rememberSaved() {
  for (const c of COLLECTIONS) { const m = saved[c]; m.clear(); (S[c] as { id: string }[]).forEach(r => m.set(r.id, JSON.stringify(r))); }
  savedKV.set('cats', JSON.stringify(S.cats)); savedKV.set('settings', JSON.stringify(S.settings)); savedKV.set('meta', JSON.stringify(S.meta));
}

/** 启动时加载；首次启动写入默认空账本 */
export async function load(dbName?: string): Promise<{ fresh: boolean }> {
  try {
    db = await openLedgerDB(dbName);
  } catch {
    memoryOnly = true; S = emptyState(); return { fresh: true };
  }
  const raw = await readAll(db);
  const fresh = !raw.kv.meta;
  if (fresh) {
    S = emptyState();
    await db.put('kv', { key: 'dataVersion', value: DATA_VERSION });
    for (const m of Object.values(saved)) m.clear(); savedKV.clear();
    await flushNow();
  } else {
    const from = Number(raw.kv.dataVersion) || DATA_VERSION;
    if (from < DATA_VERSION) migrateData(raw, from);
    S = hydrate(raw);
    if (from < DATA_VERSION) { for (const m of Object.values(saved)) m.clear(); savedKV.clear(); await db.put('kv', { key: 'dataVersion', value: DATA_VERSION }); await flushNow(); }
    else rememberSaved();
  }
  try {
    channel = new BroadcastChannel('xiaozhangben');
    channel.onmessage = async () => { if (!db) return; S = hydrate(await readAll(db)); rememberSaved(); listeners.forEach(f => f()); };
  } catch { /* 不支持时忽略 */ }
  return { fresh };
}

/** 标记有修改，合并到一个事务中写入 */
export function save() {
  if (pending) return; pending = true;
  queueMicrotask(() => { pending = false; flushing = flushNow().finally(() => { flushing = null; }); });
}

async function flushNow() {
  if (!db || memoryOnly) return;
  const t = db.transaction(['tx', 'accounts', 'books', 'recurs', 'kv'], 'readwrite');
  let changed = 0;
  for (const c of COLLECTIONS) {
    const store = t.objectStore(c) as any; const m = saved[c]; const live = new Set<string>();
    for (const r of S[c] as { id: string }[]) {
      live.add(r.id); const j = JSON.stringify(r);
      if (m.get(r.id) !== j) { store.put(r); m.set(r.id, j); changed++; }
    }
    for (const id of [...m.keys()]) if (!live.has(id)) { store.delete(id); m.delete(id); changed++; }
  }
  for (const k of ['cats', 'settings', 'meta'] as const) {
    const j = JSON.stringify(S[k]);
    if (savedKV.get(k) !== j) { t.objectStore('kv').put({ key: k, value: JSON.parse(j) }); savedKV.set(k, j); changed++; }
  }
  await t.done;
  if (changed) channel?.postMessage('changed');
}

/** 等待所有写入完成（测试与导出前使用） */
export async function flush() { if (pending) await new Promise(r => queueMicrotask(() => r(null))); if (flushing) await flushing; }

/** 整体替换状态（撤销、导入、清空） */
export function replaceState(next: State) { S = next; save(); }
export const snapshot = (): State => structuredClone(S);

/** 申请持久化存储，降低被浏览器清理的风险 */
export async function requestPersist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
