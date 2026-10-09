import { describe, expect, it } from 'vitest';
import { centsToExpr, displayValue, evalExpr, exprLine, hasOp, press, type ExprState, type Key } from '../../src/core/expr';

const run = (keys: string, from: ExprState = { expr: '', evald: false }) => {
  let st = from; const actions: string[] = [];
  for (const k of keys.split(' ')) { const r = press(st, k as Key); st = r.state; if (r.action) actions.push(r.action); }
  return { st, actions };
};

describe('键盘算式', () => {
  it('输入小数时实时显示原始输入', () => {
    expect(displayValue(run('3 9 .').st)).toBe('39.');
    expect(displayValue(run('3 9 . 9').st)).toBe('39.9');
    expect(displayValue(run('3 9 . 9 0').st)).toBe('39.90');
  });
  it('按「=」后结果统一两位小数：39.9 显示 39.90', () => {
    const { st } = run('2 0 + 1 9 . 9 ok');
    expect(st.expr).toBe('39.9');
    expect(st.evald).toBe(true);
    expect(displayValue(st)).toBe('39.90');
    // 继续按键可接着编辑，不受影响
    const next = run('5', st).st;
    expect(next.expr).toBe('39.95');
    expect(displayValue(next)).toBe('39.95');
    const back = run('back', st).st;
    expect(back.expr).toBe('39.');
    expect(displayValue(back)).toBe('39.');
  });
  it('整数结果也显示两位小数', () => {
    const { st } = run('1 0 + 3 0 ok');
    expect(st.expr).toBe('40');
    expect(displayValue(st)).toBe('40.00');
  });
  it('加减连算与浮点精度', () => {
    expect(evalExpr('0.1+0.2')).toBe(30);
    expect(evalExpr('100-36.8+0.05')).toBe(6325);
    expect(exprLine(run('1 0 0 - 3 6 . 8').st)).toBe('100 − 36.8 =');
    expect(hasOp('12')).toBe(false);
    expect(hasOp('12+')).toBe(true);
  });
  it('结果为 0 或负数时清空', () => {
    expect(run('5 - 8 ok').st.expr).toBe('');
    expect(run('5 - 5 ok').st.expr).toBe('');
  });
  it('输入限制：两位小数、8 位整数、前导 0、重复运算符', () => {
    expect(run('1 . 2 3 4 5').actions).toEqual(['bump', 'bump']);
    expect(run('1 . 2 3 4').st.expr).toBe('1.23');
    expect(run('1 2 3 4 5 6 7 8 9').st.expr).toBe('12345678');
    expect(run('0 0 5').st.expr).toBe('5');
    expect(run('.').st.expr).toBe('0.');
    expect(run('1 . .').st.expr).toBe('1.');
    expect(run('1 + -').st.expr).toBe('1-');
    expect(run('1 . +').st.expr).toBe('1+');
    expect(run('+').st.expr).toBe('');
    expect(run('5 + .').st.expr).toBe('5+0.');
  });
  it('无运算符时「完成」触发保存，「再记」触发连续记账', () => {
    expect(run('1 2 ok').actions).toEqual(['commit']);
    expect(run('1 2 again').actions).toEqual(['commitAgain']);
    expect(run('1 + 2 ok').actions).toEqual([]);
  });
  it('centsToExpr 去掉多余的 0', () => {
    expect(centsToExpr(3990)).toBe('39.9');
    expect(centsToExpr(4000)).toBe('40');
    expect(centsToExpr(3995)).toBe('39.95');
    expect(centsToExpr(5)).toBe('0.05');
  });
  it('空输入显示 0.00', () => { expect(displayValue({ expr: '', evald: false })).toBe('0.00'); });
});
