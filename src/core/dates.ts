export const pad = (n: number | string) => String(n).padStart(2, '0');
export const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s: string) => new Date(s + 'T00:00:00');
export const addDays = (s: string, n: number) => { const d = parseD(s); d.setDate(d.getDate() + n); return ds(d); };
export const ymAdd = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const ymLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${y}年${+m}月`; };
export const daysIn = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const md = (s: string) => { const d = parseD(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const fullDate = (s: string) => { const d = parseD(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`; };
export const clampDom = (y: number, m0: number, dom: number) => ds(new Date(y, m0, Math.min(dom, new Date(y, m0 + 1, 0).getDate())));
export const dayDiff = (a: string, b: string) => Math.round((parseD(a).getTime() - parseD(b).getTime()) / 864e5);
export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseD(s).getTime()) && ds(parseD(s)) === s;

/** 当前日期（实时计算，App 跨过午夜也正确） */
let fixedToday: string | null = null;
export const today = () => fixedToday ?? ds(new Date());
export const curYM = () => today().slice(0, 7);
/** 仅测试使用 */
export const __setToday = (s: string | null) => { fixedToday = s; };

export function dayLabel(d: string, t = today()) {
  const diff = dayDiff(t, d);
  return { main: md(d), rel: diff === 0 ? '今天' : diff === 1 ? '昨天' : diff === 2 ? '前天' : WEEK[parseD(d).getDay()] };
}
