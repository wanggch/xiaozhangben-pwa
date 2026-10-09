/**
 * 示例数据：相对今天生成近三个月的账单，全部带 sample 标记，可一键清除。
 * 与原型使用同一随机种子，数据分布与原型一致。
 */
import type { Account, Recur, State, Tx } from './types';
import { clampDom, daysIn, pad, parseD, ymAdd } from './dates';
import { defaultBook } from './defaults';
import { defaultCats } from './constants';

export function makeSamples(today: string) {
  const curYM = today.slice(0, 7);
  let seed = 20261008; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const pool: Record<string, [string, string, number][]> = {
    food: [['早餐', '包子 + 豆浆', 9], ['午饭', '黄焖鸡米饭', 26], ['咖啡', '生椰拿铁', 13.9], ['晚饭', '楼下麻辣烫', 32], ['奶茶', '伯牙绝弦', 18], ['外卖', '轻食沙拉', 35], ['水果', '车厘子', 59.9]],
    traffic: [['地铁', '通勤', 4], ['打车', '加班回家', 36.5], ['共享单车', '', 1.5], ['高铁', '周末去杭州', 73]],
    shop: [['超市', '日用品补货', 86.4], ['淘宝', '机械键盘键帽', 129], ['优衣库', '卫衣', 199], ['京东', '显示器支架', 239]],
    fun: [['电影', 'IMAX 场', 58], ['Steam', '独立游戏', 48], ['会员', '视频会员', 25], ['KTV', '和朋友', 96]],
    med: [['药店', '感冒药', 36.8]],
    study: [['课程', 'Blender 建模课', 199], ['书', '《Three.js 开发指南》', 79], ['订阅', 'AI 编程工具', 145]],
    other: [['快递', '寄件', 12], ['理发', '', 45]],
  };
  const ACC: Record<string, string[]> = { food: ['a-wx', 'a-wx', 'a-ali', 'a-ali', 'a-cash'], traffic: ['a-ali', 'a-wx'], shop: ['a-cc', 'a-ali'], fun: ['a-wx', 'a-cc'], med: ['a-cash'], study: ['a-cc'], other: ['a-wx'] };
  const weights: [string, number][] = [['food', 9], ['traffic', 4], ['shop', 2], ['fun', 2], ['study', 1], ['med', .4], ['other', .8]];
  const wT = weights.reduce((a, w) => a + w[1], 0);
  const pickCat = () => { let r = rnd() * wT; for (const [c, w] of weights) { if ((r -= w) < 0) return c; } return 'food'; };
  const tx: Tx[] = []; let n = 0;
  const add = (o: Partial<Tx> & { amountYuan: number; date: string; type: Tx['type'] }) => {
    n++; const { amountYuan, ...rest } = o;
    tx.push({ id: 's' + n, book: 'b-daily', note: '', cat: null, acct: null, toAcct: null, ts: new Date(o.date + 'T08:00:00').getTime() + n * 60000, sample: true, ...rest, amount: Math.round(amountYuan * 100) });
  };
  const E = (cat: string, a: number, name: string, note: string, date: string, acct: string, book?: string) => add({ type: 'expense', cat, amountYuan: a, note: [name, note].filter(Boolean).join(' · '), date, acct, ...(book ? { book } : {}) });
  const I = (cat: string, a: number, name: string, note: string, date: string, acct: string) => add({ type: 'income', cat, amountYuan: a, note: [name, note].filter(Boolean).join(' · '), date, acct });
  const X = (a: number, from: string, to: string, note: string, date: string) => add({ type: 'transfer', amountYuan: a, acct: from, toAcct: to, note, date });
  for (let k = -2; k <= 0; k++) {
    const ym = ymAdd(curYM, k); const last = k === 0 ? +today.slice(8) : daysIn(ym);
    for (let d = 1; d <= last; d++) {
      const date = `${ym}-${pad(d)}`;
      if (d === 1) E('house', 2800, '房租', '整租一居室', date, 'a-cmb');
      if (d === 5) I('salary', 15000, '工资', '', date, 'a-cmb');
      if (d === 15) E('house', 186.5, '水电燃气', '', date, 'a-cmb');
      if (d === 20) I('invest', 36.8 + k * 3, '余额宝收益', '', date, 'a-ali');
      if (d === 10 && k < 0) X(1200 + Math.round(rnd() * 800), 'a-cmb', 'a-cc', '信用卡还款', date);
      if (d === 6 && k === 0) X(1000, 'a-cmb', 'a-wx', '零钱充值', date);
      if (d === 3 && k === 0) I('part', 2000, '网站外包', '落地页设计', date, 'a-ali');
      if (d === 12 && k === -1) I('gift', 88.8, '红包', '朋友回礼', date, 'a-wx');
      if (d === 7 && k === 0) I('gift', 200, '红包', '家里给的', date, 'a-wx');
      const m = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < m; i++) { const c = pickCat(); const [nm, note, amt] = pick(pool[c]); E(c, amt * (0.85 + rnd() * 0.3), nm, note, date, pick(ACC[c])); }
    }
  }
  const tm = ymAdd(curYM, -1), T = (d: string) => `${tm}-${d}`;
  ([['traffic', 146, '高铁', '上海 → 杭州', '13', 'a-ali'], ['house', 468, '民宿', '西湖边两晚', '13', 'a-cc'], ['food', 86, '知味观', '小笼包', '13', 'a-wx'],
    ['fun', 75, '门票', '灵隐飞来峰', '14', 'a-wx'], ['food', 132, '外婆家', '晚饭', '14', 'a-ali'], ['traffic', 36, '打车', '', '14', 'a-ali'], ['shop', 59, '龙井茶', '伴手礼', '14', 'a-wx'],
    ['food', 28, '片儿川', '', '15', 'a-cash'], ['traffic', 146, '高铁', '杭州 → 上海', '15', 'a-ali']] as [string, number, string, string, string, string][])
    .forEach(([c, a, nm, no, d, ac]) => E(c, a, nm, no, T(d), ac, 'b-trip'));
  // 账户：按目标余额倒推期初
  const target: Record<string, number> = { 'a-cmb': 3842000, 'a-wx': 128640, 'a-ali': 653218, 'a-cash': 86050, 'a-cc': -231680 };
  const flow = (id: string) => tx.reduce((b, t) => b + (t.type === 'income' && t.acct === id ? t.amount : 0) - (t.type === 'expense' && t.acct === id ? t.amount : 0) - (t.type === 'transfer' && t.acct === id ? t.amount : 0) + (t.type === 'transfer' && t.toAcct === id ? t.amount : 0), 0);
  const accounts: Account[] = ([['a-cmb', '招商银行', 'bank', 0], ['a-wx', '微信钱包', 'wechat', 1], ['a-ali', '支付宝', 'alipay', 2], ['a-cash', '现金', 'cash', 3], ['a-cc', '招行信用卡', 'credit', 4]] as const)
    .map(([id, name, type, order]) => ({ id, name, type, order, init: 0, sampleInit: target[id] - flow(id), sample: true }));
  const t0 = parseD(today), y = t0.getFullYear(), m0 = t0.getMonth(), dom = t0.getDate();
  const nextDom = (d: number, inc: boolean) => (dom < d || (inc && dom === d)) ? clampDom(y, m0, d) : clampDom(y, m0 + 1, d);
  const startOf = (d: number) => clampDom(y, m0 - 2, d);
  const recurs: Recur[] = ([
    { id: 'r-rent', name: '房租', type: 'expense', cat: 'house', amount: 280000, acct: 'a-cmb', freq: 'month', dom: 1, start: startOf(1), next: nextDom(1, false), mode: 'auto' },
    { id: 'r-salary', name: '工资', type: 'income', cat: 'salary', amount: 1500000, acct: 'a-cmb', freq: 'month', dom: 5, start: startOf(5), next: nextDom(5, false), mode: 'auto' },
    { id: 'r-ai', name: 'AI 编程工具订阅', type: 'expense', cat: 'study', amount: 14500, acct: 'a-cc', freq: 'month', dom, start: startOf(dom), next: today, mode: 'remind' },
    { id: 'r-video', name: '视频会员', type: 'expense', cat: 'fun', amount: 2500, acct: 'a-wx', freq: 'month', dom: 18, start: startOf(18), next: nextDom(18, true), mode: 'remind' },
  ] as Omit<Recur, 'book' | 'on'>[]).map(r => ({ ...r, book: 'b-daily', on: true, sample: true }));
  return { tx, accounts, recurs };
}

/** 载入示例数据：合并到当前数据中，不影响用户已有记录 */
export function applySamples(S: State, today: string) {
  const s = makeSamples(today);
  // 已有示例先移除，避免重复
  if (S.tx.some(t => t.sample)) clearSamples(S);
  const dailyId = S.books.find(b => b.id === S.meta.curBook && !b.sample)?.id || S.books.find(b => !b.sample)?.id || 'b-daily';
  if (!S.books.find(b => b.id === dailyId)) S.books.unshift(defaultBook());
  const daily = S.books.find(b => b.id === dailyId)!;
  if (!daily.budget && !Object.keys(daily.catBudgets).length) { daily.budget = 600000; daily.catBudgets = { food: 180000, shop: 40000, fun: 30000, traffic: 40000 }; daily.sampleBudget = true; }
  if (!S.books.find(b => b.id === 'b-trip')) S.books.push({ id: 'b-trip', name: '杭州旅行', budget: 150000, catBudgets: {}, sample: true, order: S.books.length });
  const remap = (b: string) => b === 'b-daily' ? dailyId : b;
  S.tx.push(...s.tx.map(t => ({ ...t, book: remap(t.book) })));
  for (const a of s.accounts) {
    const ex = S.accounts.find(x => x.id === a.id);
    if (ex) ex.sampleInit = a.sampleInit; else S.accounts.push(a);
  }
  for (const r of s.recurs) if (!S.recurs.find(x => x.id === r.id)) S.recurs.push({ ...r, book: dailyId });
  const dc = defaultCats();
  for (const t of s.tx) {
    if (t.type === 'transfer' || !t.cat) continue;
    const list = S.cats[t.type]; if (!list.find(c => c.id === t.cat)) { const c = dc[t.type].find(c => c.id === t.cat); if (c) list.push({ ...c }); }
  }
  if (!S.meta.history.length) S.meta.history = ['咖啡', '打车'];
  S.meta.sampleTip = true;
}

/** 清除全部示例数据，用户自己的记录不受影响 */
export function clearSamples(S: State) {
  S.tx = S.tx.filter(t => !t.sample);
  const used = new Set(S.tx.flatMap(t => [t.acct, t.toAcct]));
  S.recurs = S.recurs.filter(r => !r.sample);
  S.recurs.forEach(r => used.add(r.acct));
  S.accounts = S.accounts.filter(a => !a.sample || used.has(a.id));
  S.accounts.forEach(a => { delete a.sampleInit; delete a.sample; });
  S.books = S.books.filter(b => !b.sample || S.tx.some(t => t.book === b.id));
  S.books.forEach(b => { if (b.sampleBudget) { b.budget = 0; b.catBudgets = {}; delete b.sampleBudget; } delete b.sample; });
  if (!S.books.length) S.books = [defaultBook()];
  if (!S.books.find(b => b.id === S.meta.curBook)) S.meta.curBook = S.books[0].id;
  S.meta.sampleTip = false;
}
