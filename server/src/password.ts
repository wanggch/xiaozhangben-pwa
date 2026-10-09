/** 密码哈希：scrypt（Node 内置，OWASP 推荐参数 N=2^17, r=8, p=1），格式 scrypt$N$r$p$salt$hash */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw.normalize('NFKC'), salt, len, opts, (e, k) => e ? rej(e) : res(k)));

const N = Number(process.env.SCRYPT_N) || 2 ** 17; // 测试环境可调低
const R = 8, P = 1, LEN = 32;
const maxmem = (n: number, r: number) => 128 * n * r * 2 + 1024 * 1024;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, s, h] = stored.split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const key = await scrypt(pw, Buffer.from(s, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: maxmem(+n, +r) });
  return key.length === want.length && timingSafeEqual(key, want);
}

/** 账号不存在时也做一次同等代价的计算，避免通过响应时间判断邮箱是否注册 */
let dummy: Promise<string> | null = null;
export async function burnPasswordTime(pw: string) { dummy ??= hashPassword('dummy-password-for-timing'); await verifyPassword(pw, await dummy); }

export const PASSWORD_MIN = 8, PASSWORD_MAX = 256;
