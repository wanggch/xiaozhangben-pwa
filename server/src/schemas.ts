/** 输入校验（zod）：账号接口与同步记录 */
import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN } from './password.js';

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ message: '邮箱格式不正确' }));
export const password = z.string().min(PASSWORD_MIN, `密码至少 ${PASSWORD_MIN} 位`).max(PASSWORD_MAX, '密码过长');
export const Credentials = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX) }).strict();
export const Signup = z.object({ email, password }).strict();
export const ChangePassword = z.object({ current: z.string().min(1).max(PASSWORD_MAX), next: password }).strict();
export const DeleteAccount = z.object({ password: z.string().min(1).max(PASSWORD_MAX) }).strict();

/* ---- 同步记录 ---- */
export const KINDS = ['tx', 'account', 'book', 'recur', 'cat', 'settings'] as const;
export type Kind = typeof KINDS[number];
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'id 格式不正确');
const cents = z.number().int().min(-1e13).max(1e13);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (n: number) => z.string().max(n);
const nullableId = id.nullable().optional();

// 允许额外字段（looseObject），以便前端新增字段时旧服务端不丢数据；关键字段做类型校验
export const DATA: Record<Kind, z.ZodType> = {
  tx: z.looseObject({ id, book: id, type: z.enum(['expense', 'income', 'transfer']), amount: cents.min(0), date, cat: nullableId, acct: nullableId, toAcct: nullableId, note: text(200).optional() }),
  account: z.looseObject({ id, name: text(40), type: text(20), init: cents, order: z.number().optional() }),
  book: z.looseObject({ id, name: text(40), budget: cents.min(0).optional(), catBudgets: z.record(z.string().max(64), cents.min(0)).optional() }),
  recur: z.looseObject({ id, type: z.enum(['expense', 'income']), amount: cents.min(0), freq: text(10), start: date }),
  cat: z.looseObject({ id, name: text(20), type: z.enum(['expense', 'income']), order: z.number() }),
  settings: z.looseObject({ currency: text(8).optional() }).refine(v => !('pin' in v) && !('lock' in v), '应用锁信息不能上传'),
};
export const MAX_RECORD_BYTES = 16 * 1024;

export const Change = z.object({
  kind: z.enum(KINDS),
  id,
  deleted: z.boolean(),
  data: z.unknown().optional(),
}).strict();
export const Push = z.object({ changes: z.array(Change).max(500) }).strict();
export const PullQuery = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
}).strict();

export function validateData(kind: Kind, recId: string, data: unknown): { ok: true; json: string } | { ok: false; error: string } {
  const r = DATA[kind].safeParse(data);
  if (!r.success) return { ok: false, error: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  if (kind !== 'settings' && (r.data as { id: string }).id !== recId) return { ok: false, error: 'id 与记录不一致' };
  const json = JSON.stringify(data);
  if (json.length > MAX_RECORD_BYTES) return { ok: false, error: '记录过大' };
  return { ok: true, json };
}
