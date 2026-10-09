/**
 * 应用锁 PIN：使用 Web Crypto PBKDF2-SHA256 + 16 字节随机盐，只保存哈希，不保存明文。
 * 注意：4 位 PIN 只有 1 万种组合，哈希只能防止明文泄露，防不住离线穷举；应用锁定位是「防他人随手查看」。
 */
import type { PinHash } from './types';

export const PIN_ITER = 150_000;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, iter = PIN_ITER): Promise<PinHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: b64(await derive(pin, salt, iter)), iter, algo: 'PBKDF2-SHA256' };
}

export async function verifyPin(pin: string, h: PinHash | null): Promise<boolean> {
  if (!h || !h.salt || !h.hash) return false;
  const got = await derive(pin, unb64(h.salt), h.iter || PIN_ITER); const want = unb64(h.hash);
  if (got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** 连续输错的冷却时间（毫秒）：5 次后 30 秒，之后每多错一次翻倍，最长 15 分钟 */
export const lockoutMs = (fails: number) => fails < 5 ? 0 : Math.min(15 * 60_000, 30_000 * Math.pow(2, fails - 5));
