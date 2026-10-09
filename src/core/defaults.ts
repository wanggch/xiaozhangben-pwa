import type { Book, Settings, State } from './types';
import { defaultCats } from './constants';

export const defaultSettings = (): Settings => ({ currency: '¥', weekStart: 1, theme: 'auto', remind: false, remindTime: '21:00', lock: false, pin: null });
export const defaultBook = (): Book => ({ id: 'b-daily', name: '日常账本', budget: 0, catBudgets: {}, order: 0 });

/** 首次启动：空账本 + 默认分类 + 常用账户 */
export function emptyState(): State {
  return {
    books: [defaultBook()],
    accounts: [
      { id: 'a-wx', name: '微信钱包', type: 'wechat', init: 0, order: 1 },
      { id: 'a-ali', name: '支付宝', type: 'alipay', init: 0, order: 2 },
      { id: 'a-cash', name: '现金', type: 'cash', init: 0, order: 3 },
    ],
    cats: defaultCats(),
    tx: [], recurs: [],
    settings: defaultSettings(),
    meta: { onboarded: false, curBook: 'b-daily', history: [], sampleTip: false, lastAcct: 'a-wx' },
  };
}

/** 清空全部数据（保留设置与应用锁） */
export function clearedState(prev: State): State {
  const s = emptyState();
  s.accounts = [];
  s.settings = prev.settings;
  s.meta = { ...s.meta, onboarded: true, lastAcct: null, installTipDismissed: prev.meta.installTipDismissed };
  return s;
}
