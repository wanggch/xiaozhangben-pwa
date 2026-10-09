import { describe, expect, it } from 'vitest';
import { fmt2, money, parseCents, plain, short, sumAmt } from '../../src/core/money';

describe('金额（分）', () => {
  it('parseCents 不经过浮点误差', () => {
    expect(parseCents('0.1')).toBe(10);
    expect(parseCents('0.29')).toBe(29);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('¥13.9')).toBe(1390);
    expect(parseCents('-2316.8')).toBe(-231680);
    expect(parseCents('12.345')).toBe(1235);
    expect(parseCents('12.344')).toBe(1234);
    expect(parseCents('')).toBe(0);
    expect(parseCents('abc')).toBe(0);
    expect(parseCents(.1 + .2)).toBe(30);
    expect(parseCents(1.005)).toBe(101);
    expect(parseCents(36.8 - 6)).toBe(3080);
  });
  it('累加不会出现 0.30000000000000004', () => {
    const list = [10, 20].map(amount => ({ amount }));
    expect(sumAmt(list)).toBe(30);
    expect(fmt2(sumAmt(list))).toBe('0.30');
  });
  it('格式化', () => {
    expect(fmt2(374439)).toBe('3,744.39');
    expect(fmt2(-5)).toBe('0.05');
    expect(money(-231680, '¥')).toBe('-¥2,316.80');
    expect(plain(123450)).toBe('1234.50');
    expect(plain(-7)).toBe('-0.07');
    expect(short(1234500)).toBe('1.2万');
    expect(short(123400)).toBe('1.2k');
    expect(short(5600)).toBe('56');
  });
});
