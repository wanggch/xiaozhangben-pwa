import { describe, it, expect } from 'vitest';
import { setup, tx } from './helpers.js';

const push = (t: Awaited<ReturnType<typeof setup>>, c: string, changes: unknown[]) => t.post('/api/sync/push', { changes }, c);
const pull = async (t: Awaited<ReturnType<typeof setup>>, c: string, since = 0) => (await t.get(`/api/sync/pull?since=${since}`, c)).json();

describe('同步：推送与增量拉取', () => {
  it('推送后按序列号增量拉取；未变化的记录不产生新序列号', async () => {
    const t = await setup(); const a = await t.user('a@x.com');
    const r1 = await push(t, a, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1') }, { kind: 'account', id: 'a-wx', deleted: false, data: { id: 'a-wx', name: '微信钱包', type: 'wechat', init: 0, order: 1 } }]);
    expect(r1.statusCode).toBe(200);
    expect(r1.json().results.map((r: any) => r.seq)).toEqual([1, 2]);
    const all = await pull(t, a);
    expect(all.changes.map((c: any) => [c.kind, c.id, c.seq])).toEqual([['tx', 't1', 1], ['account', 'a-wx', 2]]);
    expect(all.changes[0].data.amount).toBe(1234);
    expect(all.cursor).toBe(2); expect(all.hasMore).toBe(false);
    const same = await push(t, a, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1') }]);
    expect(same.json().results[0].unchanged).toBe(true);
    expect((await pull(t, a, 2)).changes).toHaveLength(0);
  });
  it('分页：hasMore 与游标', async () => {
    const t = await setup(); const a = await t.user('a@x.com');
    await push(t, a, Array.from({ length: 5 }, (_, i) => ({ kind: 'tx', id: `t${i}`, deleted: false, data: tx(`t${i}`) })));
    const p1 = (await t.get('/api/sync/pull?since=0&limit=3', a)).json();
    expect(p1.changes).toHaveLength(3); expect(p1.hasMore).toBe(true);
    const p2 = (await t.get(`/api/sync/pull?since=${p1.cursor}&limit=3`, a)).json();
    expect(p2.changes.map((c: any) => c.id)).toEqual(['t3', 't4']); expect(p2.hasMore).toBe(false);
  });
  it('冲突：记录级 last-write-wins（后到服务端者胜），服务端时间戳单调递增', async () => {
    const t = await setup();
    const d1 = await t.user('a@x.com'); const d2 = await t.login('a@x.com', 'correct horse battery');
    await push(t, d1, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1', 100, { note: '设备一' }) }]);
    const w1 = (await push(t, d1, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1', 200, { note: '设备一改' }) }])).json().results[0];
    const w2 = (await push(t, d2, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1', 300, { note: '设备二改' }) }])).json().results[0];
    expect(w2.updatedAt).toBeGreaterThan(w1.updatedAt); expect(w2.seq).toBeGreaterThan(w1.seq);
    const latest = (await pull(t, d1)).changes.find((c: any) => c.id === 't1');
    expect(latest.data.note).toBe('设备二改'); expect(latest.data.amount).toBe(300);
  });
  it('软删除：删除产生墓碑，其他设备增量拉取能收到；删除后可再次创建', async () => {
    const t = await setup(); const a = await t.user('a@x.com');
    await push(t, a, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1') }]);
    const cur = (await pull(t, a)).cursor;
    await push(t, a, [{ kind: 'tx', id: 't1', deleted: true }]);
    const d = (await pull(t, a, cur)).changes;
    expect(d).toEqual([expect.objectContaining({ kind: 'tx', id: 't1', deleted: true, data: null })]);
    const row = t.db.prepare("SELECT deleted, data FROM records WHERE id = 't1'").get() as any;
    expect(row.deleted).toBe(1); expect(row.data).toBeNull();
    await push(t, a, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1', 5) }]);
    expect((await pull(t, a)).changes.find((c: any) => c.id === 't1').deleted).toBe(false);
    // 删除云端从未存在的记录：不产生墓碑
    expect((await push(t, a, [{ kind: 'tx', id: 'never', deleted: true }])).json().results[0].unchanged).toBe(true);
  });
  it('校验：非整数金额、id 不一致、上传 PIN、未知类型、超过 500 条一律整批拒绝', async () => {
    const t = await setup(); const a = await t.user('a@x.com');
    const bad = [
      [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1', 12.5) }],
      [{ kind: 'tx', id: 't1', deleted: false, data: tx('t2') }],
      [{ kind: 'settings', id: 'settings', deleted: false, data: { currency: '¥', pin: { hash: 'x' } } }],
      [{ kind: 'secrets', id: 'x', deleted: false, data: {} }],
      [{ kind: 'tx', id: '../../etc', deleted: false, data: tx('../../etc') }],
      Array.from({ length: 501 }, (_, i) => ({ kind: 'tx', id: `t${i}`, deleted: false, data: tx(`t${i}`) })),
    ];
    for (const b of bad) expect((await push(t, a, b)).statusCode).toBe(400);
    // 一条好的 + 一条坏的：整批回滚
    expect((await push(t, a, [{ kind: 'tx', id: 'ok', deleted: false, data: tx('ok') }, { kind: 'tx', id: 'bad', deleted: false, data: tx('bad', -1) }])).statusCode).toBe(400);
    expect((await pull(t, a)).changes).toHaveLength(0);
  });
  it('云端记录数上限', async () => {
    const t = await setup({ MAX_RECORDS_PER_USER: '3' }); const a = await t.user('a@x.com');
    expect((await push(t, a, [1, 2, 3].map(i => ({ kind: 'tx', id: `t${i}`, deleted: false, data: tx(`t${i}`) })))).statusCode).toBe(200);
    expect((await push(t, a, [{ kind: 'tx', id: 't4', deleted: false, data: tx('t4') }])).statusCode).toBe(413);
  });
});

describe('越权访问', () => {
  it('每个用户只能读写自己的数据：同 id 互不影响，拉取看不到他人记录', async () => {
    const t = await setup();
    const a = await t.user('a@x.com'); const b = await t.user('b@x.com');
    await push(t, a, [{ kind: 'tx', id: 'shared-id', deleted: false, data: tx('shared-id', 111, { note: 'A 的秘密' }) }]);
    expect((await pull(t, b)).changes).toHaveLength(0);
    // B 推送同 id、删除同 id，都只作用于 B 自己
    await push(t, b, [{ kind: 'tx', id: 'shared-id', deleted: false, data: tx('shared-id', 222, { note: 'B' }) }]);
    await push(t, b, [{ kind: 'tx', id: 'shared-id', deleted: true }]);
    const aView = (await pull(t, a)).changes;
    expect(aView).toHaveLength(1); expect(aView[0].data.note).toBe('A 的秘密'); expect(aView[0].deleted).toBe(false);
    expect(JSON.stringify(await pull(t, b))).not.toContain('A 的秘密');
    // 序列号按用户独立
    expect((await t.get('/api/auth/me', a)).json().sync.head).toBe(1);
    expect((await t.get('/api/auth/me', b)).json().sync.head).toBe(2);
  });
  it('查询参数不能指定其他用户；未登录不能同步', async () => {
    const t = await setup();
    const a = await t.user('a@x.com'); await t.user('b@x.com');
    await push(t, a, [{ kind: 'tx', id: 't1', deleted: false, data: tx('t1') }]);
    expect((await t.get('/api/sync/pull?since=0&userId=1')).statusCode).toBe(401);
    const b = await t.login('b@x.com', 'correct horse battery');
    expect((await t.get('/api/sync/pull?since=0&userId=1', b)).statusCode).toBe(400);
    expect((await t.post('/api/sync/push', { changes: [] })).statusCode).toBe(401);
    expect((await t.post('/api/sync/push', { changes: [] }, 'xzb_sid=forged; __Host-xzb_sid=forged')).statusCode).toBe(401);
  });
});
