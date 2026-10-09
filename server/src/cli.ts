/**
 * 服务器管理命令（在服务器上运行，直接操作数据库）：
 *   create-user <email> [--admin] [--password-stdin]   创建账号（默认交互输入两次密码）
 *   reset-password <email> [--password-stdin]          重置密码，并让该账号所有设备下线、解除登录锁定
 *   list-users                                         列出账号
 *   revoke-sessions <email>                            让该账号所有设备下线
 *   unlock <email>                                     解除登录失败锁定
 *   delete-user <email> --yes                          删除账号及其全部云端数据
 *   backup --dir <目录> [--keep-days 14]               在线备份数据库（SQLite 备份 API），并删除过期备份
 *   migrate                                            仅执行数据库迁移
 */
import { createInterface } from 'node:readline';
import { mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { Accounts } from './accounts.js';
import { email as emailSchema, password as passwordSchema } from './schemas.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const die = (msg: string): never => { console.error('错误：' + msg); process.exit(1); };

async function readPassword(): Promise<string> {
  if (flag('--password-stdin') || !process.stdin.isTTY) {
    const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
  }
  const ask = (q: string) => new Promise<string>(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as any)._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
  const a = await ask('新密码：'); const b = await ask('再次输入：');
  if (a !== b) die('两次输入不一致');
  return a;
}
const checkPw = (pw: string) => { const r = passwordSchema.safeParse(pw); if (!r.success) die(r.error.issues[0].message); return pw; };
const checkEmail = (e?: string) => { const r = emailSchema.safeParse(e ?? ''); if (!r.success) die('请提供有效邮箱'); return r.data!; };

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const acc = new Accounts(db, cfg);
const fmt = (t: number) => new Date(t).toLocaleString('zh-CN', { hour12: false });

try {
  switch (cmd) {
    case 'create-user': {
      const e = checkEmail(args[1]); if (acc.byEmail(e)) die('该邮箱已存在');
      const u = await acc.create(e, checkPw(await readPassword()), flag('--admin'));
      console.log(`已创建账号 #${u.id} ${u.email}${u.is_admin ? '（管理员）' : ''}`); break;
    }
    case 'reset-password': {
      const u = acc.byEmail(checkEmail(args[1])) ?? die('账号不存在');
      await acc.setPassword(u.id, checkPw(await readPassword()));
      const n = acc.revokeAll(u.id); acc.clearFailures(u.email);
      console.log(`已重置 ${u.email} 的密码，${n} 个会话已下线`); break;
    }
    case 'list-users': {
      const rows = acc.list();
      if (!rows.length) console.log('（没有账号）');
      for (const r of rows) console.log(`#${r.id}\t${r.email}${r.is_admin ? '\t管理员' : ''}\t记录 ${r.records}\t在线会话 ${r.sessions}\t创建于 ${fmt(r.created_at)}`);
      break;
    }
    case 'revoke-sessions': {
      const u = acc.byEmail(checkEmail(args[1])) ?? die('账号不存在');
      console.log(`${acc.revokeAll(u.id)} 个会话已下线`); break;
    }
    case 'unlock': { acc.clearFailures(checkEmail(args[1])); console.log('已解除锁定'); break; }
    case 'delete-user': {
      const u = acc.byEmail(checkEmail(args[1])) ?? die('账号不存在');
      if (!flag('--yes')) die('删除不可恢复，确认请加 --yes');
      acc.delete(u.id); console.log(`已删除 ${u.email} 及其全部云端数据`); break;
    }
    case 'backup': {
      const dir = opt('--dir') ?? die('请指定 --dir'); const keep = Number(opt('--keep-days') ?? 14);
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
      const tmp = join(dir, `.xiaozhangben-${stamp}.db.tmp`), out = join(dir, `xiaozhangben-${stamp}.db`);
      await db.backup(tmp); renameSync(tmp, out);
      const cutoff = Date.now() - keep * 86_400_000; let removed = 0;
      for (const f of readdirSync(dir)) if (/^xiaozhangben-\d{8}-\d{6}\.db$/.test(f) && statSync(join(dir, f)).mtimeMs < cutoff) { unlinkSync(join(dir, f)); removed++; }
      console.log(`备份完成：${out}（${(statSync(out).size / 1024).toFixed(1)} KB），清理过期备份 ${removed} 个`); break;
    }
    case 'migrate': console.log('数据库已是最新版本'); break;
    default:
      console.log(`用法：xiaozhangben-cli <命令>
  create-user <email> [--admin] [--password-stdin]
  reset-password <email> [--password-stdin]
  list-users
  revoke-sessions <email>
  unlock <email>
  delete-user <email> --yes
  backup --dir <目录> [--keep-days 14]
  migrate`);
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
} finally { db.close(); }
