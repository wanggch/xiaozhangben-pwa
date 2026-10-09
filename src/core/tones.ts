/** 分类 / 账户的柔和配色（色调键名对应 CSS 中的 .t-xxx 与 --xxx 变量） */
import type { AcctType, Category } from './types';

export const TONES = ['indigo', 'violet', 'rose', 'coral', 'amber', 'green', 'teal', 'sky', 'slate'] as const;
export type Tone = typeof TONES[number];
export const TONE_NAMES: Record<Tone, string> = { indigo: '靛蓝', violet: '紫罗兰', rose: '玫瑰', coral: '珊瑚', amber: '琥珀', green: '青绿', teal: '湖蓝', sky: '天蓝', slate: '石墨' };

/** 默认按图标挑一个语义相近的颜色：餐饮暖橙、交通天蓝、购物玫瑰… */
const ICON_TONE: Record<string, Tone> = {
  food: 'coral', coffee: 'amber', traffic: 'sky', car: 'sky', plane: 'sky', shop: 'rose', shirt: 'rose',
  fun: 'violet', film: 'violet', music: 'violet', house: 'teal', bed: 'teal', zap: 'amber', med: 'green',
  dumbbell: 'green', study: 'indigo', phone: 'sky', paw: 'amber', users: 'violet', ticket: 'violet', gift: 'rose',
  salary: 'green', part: 'teal', invest: 'amber', wallet: 'slate', coins: 'amber', star: 'amber', heart: 'rose',
  tag: 'slate', other: 'slate',
};
const isTone = (x: unknown): x is Tone => typeof x === 'string' && (TONES as readonly string[]).includes(x);
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export function catTone(c: Pick<Category, 'id' | 'icon'> & { tone?: string | null }): Tone {
  if (isTone(c.tone)) return c.tone;
  return ICON_TONE[c.icon] || TONES[hash(c.id) % (TONES.length - 1)];
}
export const autoTone = (icon: string, id = ''): Tone => catTone({ id, icon });
export const normTone = (x: unknown): Tone | undefined => isTone(x) ? x : undefined;

const ACCT_TONE: Record<AcctType, Tone> = { wechat: 'green', alipay: 'sky', bank: 'indigo', credit: 'violet', cash: 'amber', other: 'slate' };
export const acctTone = (t?: AcctType): Tone => (t && ACCT_TONE[t]) || 'slate';
