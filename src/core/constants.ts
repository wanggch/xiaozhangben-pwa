import type { AcctType, Category, Freq } from './types';

export const PICK_ICONS = ['food', 'coffee', 'traffic', 'car', 'plane', 'shop', 'shirt', 'fun', 'film', 'music', 'house', 'bed', 'zap', 'med', 'dumbbell', 'study', 'phone', 'paw', 'users', 'ticket', 'gift', 'salary', 'part', 'invest', 'wallet', 'coins', 'star', 'heart', 'tag', 'other'];
export const ACCT_TYPES: Record<AcctType, { name: string; icon: string }> = {
  cash: { name: '现金', icon: 'cash' }, bank: { name: '银行卡', icon: 'bank' }, wechat: { name: '微信', icon: 'wechat' },
  alipay: { name: '支付宝', icon: 'alipay' }, credit: { name: '信用卡', icon: 'card' }, other: { name: '其他', icon: 'piggy' },
};
export const CURRENCIES: [string, string][] = [['¥', '人民币 CNY'], ['$', '美元 USD'], ['€', '欧元 EUR'], ['£', '英镑 GBP'], ['HK$', '港币 HKD'], ['JP¥', '日元 JPY'], ['₩', '韩元 KRW']];
export const FREQ: Record<Freq, string> = { day: '每天', week: '每周', month: '每月', year: '每年' };
export const SYS_CATS = ['other', 'iother'];
export const TYPE_NAME = { expense: '支出', income: '收入', transfer: '转账' } as const;

export const defaultCats = (): { expense: Category[]; income: Category[] } => ({
  expense: ([['food', '餐饮', 'food'], ['traffic', '交通', 'traffic'], ['shop', '购物', 'shop'], ['fun', '娱乐', 'fun'], ['house', '住房', 'house'], ['med', '医疗', 'med'], ['study', '学习', 'study'], ['other', '其他', 'other']] as const).map(([id, name, icon]) => ({ id, name, icon, shade: 0 })),
  income: ([['salary', '工资', 'salary'], ['part', '兼职', 'part'], ['invest', '理财', 'invest'], ['gift', '红包', 'gift'], ['iother', '其他', 'wallet']] as const).map(([id, name, icon]) => ({ id, name, icon, shade: 0 })),
});
