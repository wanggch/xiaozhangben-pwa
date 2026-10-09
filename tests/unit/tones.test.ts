import { describe, expect, it } from 'vitest';
import { TONES, acctTone, catTone } from '../../src/core/tones';
import { defaultCats } from '../../src/core/constants';
import { normalizeBackup } from '../../src/core/io';

describe('分类配色', () => {
  it('默认分类按图标得到不同的柔和色，非全部灰色', () => {
    const tones = defaultCats().expense.map(catTone);
    expect(new Set(tones).size).toBeGreaterThanOrEqual(6);
    expect(catTone({ id: 'food', icon: 'food' })).toBe('coral');
  });
  it('自定义颜色优先；非法值回退；未知图标按 id 稳定取色', () => {
    expect(catTone({ id: 'x', icon: 'food', tone: 'sky' })).toBe('sky');
    expect(catTone({ id: 'x', icon: 'food', tone: 'bogus' })).toBe('coral');
    const t = catTone({ id: 'c123', icon: 'nope' });
    expect(TONES).toContain(t);
    expect(catTone({ id: 'c123', icon: 'nope' })).toBe(t);
  });
  it('账户类型配色', () => {
    expect(acctTone('wechat')).toBe('green');
    expect(acctTone(undefined)).toBe('slate');
  });
  it('备份导入保留合法颜色、丢弃非法颜色', () => {
    const S = normalizeBackup({ version: 3, tx: [], cats: { expense: [{ id: 'a', name: '咖啡', icon: 'coffee', tone: 'rose' }, { id: 'b', name: '书', icon: 'study', tone: '<x>' }], income: [] } });
    const ex = S.cats.expense;
    expect(ex.find(c => c.id === 'a')?.tone).toBe('rose');
    expect(ex.find(c => c.id === 'b')?.tone).toBeUndefined();
  });
});
