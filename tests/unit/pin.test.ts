import { describe, expect, it } from 'vitest';
import { hashPin, lockoutMs, verifyPin } from '../../src/core/pin';

describe('应用锁 PIN 哈希', () => {
  it('不保存明文，随机盐，校验正确', async () => {
    const h = await hashPin('1234', 1000);
    expect(JSON.stringify(h)).not.toContain('1234');
    expect(h.algo).toBe('PBKDF2-SHA256');
    expect(await verifyPin('1234', h)).toBe(true);
    expect(await verifyPin('1235', h)).toBe(false);
    const h2 = await hashPin('1234', 1000);
    expect(h2.salt).not.toBe(h.salt);
    expect(h2.hash).not.toBe(h.hash);
    expect(await verifyPin('1234', null)).toBe(false);
  });
  it('连续输错冷却', () => {
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30000);
    expect(lockoutMs(6)).toBe(60000);
    expect(lockoutMs(20)).toBe(900000);
  });
});
