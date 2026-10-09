/** 金额一律以「分」为单位的整数存储，避免浮点误差 */
export type Cents = number;
export type TxType = 'expense' | 'income' | 'transfer';
export type CatType = 'expense' | 'income';
export type AcctType = 'cash' | 'bank' | 'wechat' | 'alipay' | 'credit' | 'other';
export type Freq = 'day' | 'week' | 'month' | 'year';
export type ThemePref = 'auto' | 'light' | 'dark';

export interface Tx {
  id: string;
  book: string;
  type: TxType;
  cat: string | null;
  amount: Cents;
  date: string; // YYYY-MM-DD
  note: string;
  acct: string | null;
  toAcct: string | null;
  ts: number;
  recurId?: string;
  sample?: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AcctType;
  /** 初始余额（分） */
  init: Cents;
  /** 示例数据带来的期初余额偏移，清除示例时一并移除 */
  sampleInit?: Cents;
  order: number;
  sample?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  shade: number;
}

export interface Book {
  id: string;
  name: string;
  budget: Cents;
  catBudgets: Record<string, Cents>;
  order: number;
  sample?: boolean;
  /** 预算由示例数据写入且用户未改动过 */
  sampleBudget?: boolean;
}

export interface Recur {
  id: string;
  book: string;
  name: string;
  type: CatType;
  cat: string;
  amount: Cents;
  acct: string | null;
  freq: Freq;
  dom: number;
  start: string;
  next: string;
  mode: 'auto' | 'remind';
  on: boolean;
  sample?: boolean;
}

export interface PinHash {
  salt: string; // base64
  hash: string; // base64
  iter: number;
  algo: 'PBKDF2-SHA256';
}

export interface Settings {
  currency: string;
  weekStart: 0 | 1;
  theme: ThemePref;
  remind: boolean;
  remindTime: string;
  lock: boolean;
  pin: PinHash | null;
}

export interface Meta {
  onboarded: boolean;
  curBook: string;
  history: string[];
  sampleTip: boolean;
  lastAcct: string | null;
  installTipDismissed?: boolean;
  lastRemindDate?: string;
}

export interface State {
  books: Book[];
  accounts: Account[];
  cats: { expense: Category[]; income: Category[] };
  tx: Tx[];
  recurs: Recur[];
  settings: Settings;
  meta: Meta;
}
