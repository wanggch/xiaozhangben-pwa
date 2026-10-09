import { describe, expect, it } from 'vitest';
import { exportCSV, exportJSON, importCSV, normalizeBackup, parseBackupText, ImportError } from '../../src/core/io';
import { parseCSV, toCSV } from '../../src/core/csv';
import { emptyState } from '../../src/core/defaults';
import { applySamples } from '../../src/core/samples';
import { balance } from '../../src/core/ledger';

describe('CSV', () => {
  it('解析引号、逗号、换行与 CRLF', () => {
    expect(parseCSV('a,b\r\n"x,1","he said ""hi"""\n"multi\nline",2\n')).toEqual([['a', 'b'], ['x,1', 'he said "hi"'], ['multi\nline', '2']]);
    expect(toCSV([['=SUM(A1)', '-12.5']])).toBe('\ufeff"\'=SUM(A1)","-12.5"');
  });
  it('导出再导入（往返）金额精确', () => {
    const S = emptyState(); applySamples(S, '2026-10-09');
    const csv = exportCSV(S);
    expect(csv.startsWith('\ufeff"日期","类型","分类","金额"')).toBe(true);
    const T = emptyState();
    const r = importCSV(T, csv);
    expect(r.n).toBe(S.tx.length);
    const sum = (x: typeof S) => x.tx.reduce((a, t) => a + t.amount, 0);
    expect(sum(T)).toBe(sum(S));
    expect(T.accounts.some(a => a.name === '招商银行')).toBe(true);
  });
  it('导入原型导出的 CSV 格式与常见日期写法', () => {
    const S = emptyState();
    const csv = '\ufeff"日期","类型","分类","金额","账户","转入账户","备注","账本","示例数据"\n"2026/10/8","支出","餐饮","13.9","微信钱包","","咖啡","日常账本",""\n"2026.10.07","收入","副业","2000","支付宝","","外包","",""\n"2026-10-06","转账","","1000","支付宝","微信钱包","充值","",""\n"bad","支出","餐饮","1","","","","",""\n';
    const r = importCSV(S, csv);
    expect(r).toEqual({ n: 3, newCats: 1, newAccts: 0, skipped: 1 });
    expect(S.tx[0]).toMatchObject({ date: '2026-10-08', amount: 1390, cat: 'food', acct: 'a-wx' });
    expect(S.tx[2]).toMatchObject({ type: 'transfer', acct: 'a-ali', toAcct: 'a-wx', amount: 100000 });
    expect(() => importCSV(S, 'foo,bar\n1,2')).toThrow(ImportError);
  });
});

describe('JSON 备份', () => {
  it('v3 往返一致，且不含 PIN', () => {
    const S = emptyState(); applySamples(S, '2026-10-09');
    S.settings.lock = true; S.settings.pin = { salt: 'x', hash: 'y', iter: 1, algo: 'PBKDF2-SHA256' };
    const text = exportJSON(S);
    expect(text).not.toContain('"hash"');
    const T = parseBackupText(text);
    expect(T.tx.length).toBe(S.tx.length);
    expect(balance(T, 'a-cmb')).toBe(3842000);
    expect(T.settings.lock).toBe(false);
  });
  it('导入原型 v2 备份（金额为元）', () => {
    const v2 = { app: 'xiaozhangben', version: 2, data: { v: 2, curBook: 'b-daily', books: [{ id: 'b-daily', name: '日常账本', budget: 6000, catBudgets: { food: 1800 } }],
      accounts: [{ id: 'a-wx', name: '微信钱包', type: 'wechat', init: 1286.4, sample: true }, { id: 'a1', name: '工行', type: 'bank', init: 100.1 }],
      cats: { expense: [{ id: 'food', name: '餐饮', icon: 'food', shade: 0 }], income: [{ id: 'salary', name: '工资', icon: 'salary', shade: 0 }] },
      tx: [{ id: 't1', book: 'b-daily', type: 'expense', cat: 'food', amount: 13.9, date: '2026-10-08', note: '咖啡', acct: 'a-wx', ts: 1 }, { id: 't2', type: 'income', cat: 'salary', amount: 0.1 + 0.2, date: '2026-10-05', acct: 'a1' }],
      recurs: [{ id: 'r', name: '房租', type: 'expense', cat: 'house', amount: 2800, acct: 'a1', freq: 'month', dom: 1, start: '2026-08-01', next: '2026-11-01', mode: 'auto', on: true, book: 'b-daily' }],
      settings: { currency: '$', weekStart: 0, theme: 'dark', remind: false, remindTime: '21:00', lock: true, pin: '1234' }, history: ['咖啡'], sampleTip: true, lastAcct: 'a-wx' } };
    const S = normalizeBackup(v2);
    expect(S.tx[0].amount).toBe(1390);
    expect(S.tx[1].amount).toBe(30);
    expect(S.books[0].budget).toBe(600000);
    expect(S.books[0].catBudgets.food).toBe(180000);
    expect(S.recurs[0].amount).toBe(280000);
    expect(S.accounts.find(a => a.id === 'a-wx')).toMatchObject({ init: 0, sampleInit: 128640 });
    expect(balance(S, 'a1')).toBe(10010 + 30);
    expect(S.settings).toMatchObject({ currency: '$', weekStart: 0, theme: 'dark', lock: false, pin: null });
    expect(S.cats.expense.some(c => c.id === 'other')).toBe(true);
    expect(S.meta.history).toEqual(['咖啡']);
  });
  it('拒绝无效文件', () => {
    expect(() => parseBackupText('{oops')).toThrow('JSON 文件无法解析');
    expect(() => parseBackupText('{"a":1}')).toThrow('不是有效的小账本备份');
    expect(() => normalizeBackup({ version: 99, data: { tx: [] } })).toThrow('更新版本');
  });
});
