/** 登录 / 注册页（独立入口，不依赖 App 代码；未登录时只能访问此页） */
import './login.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form'), err = $('err'), submit = $<HTMLButtonElement>('submit'), toggle = $('toggle');
const emailIn = $<HTMLInputElement>('email'), pwIn = $<HTMLInputElement>('password'), pw2In = $<HTMLInputElement>('password2');
let mode: 'login' | 'signup' = 'login';

const NOTICE: Record<string, string> = {
  logout: '已退出登录，本机的账本数据与离线缓存已清除。',
  expired: '登录已失效，请重新登录。',
  deleted: '账号已注销，云端与本机数据均已删除。',
};
const r = new URLSearchParams(location.search).get('r');
if (r && NOTICE[r]) { const n = $('notice'); n.textContent = NOTICE[r]; n.hidden = false; }
if (r) history.replaceState(null, '', location.pathname);

function showErr(msg: string) { err.textContent = msg; err.hidden = !msg; }
function setMode(m: typeof mode) {
  mode = m;
  submit.textContent = m === 'login' ? '登录' : '注册并登录';
  toggle.textContent = m === 'login' ? '没有账号？注册' : '已有账号？登录';
  $('sub').textContent = m === 'login' ? '登录以访问你的账本' : '创建一个账号';
  $('pw2Row').hidden = m === 'login';
  pwIn.autocomplete = m === 'login' ? 'current-password' : 'new-password';
  showErr('');
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, error: data?.error as string | undefined };
}

form.addEventListener('submit', async e => {
  e.preventDefault(); showErr('');
  const email = emailIn.value.trim(), password = pwIn.value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('请输入有效的邮箱');
  if (!password) return showErr('请输入密码');
  if (mode === 'signup') {
    if (password.length < 8) return showErr('密码至少 8 位');
    if (password !== pw2In.value) return showErr('两次输入的密码不一致');
  }
  submit.disabled = true; submit.textContent = '请稍候…';
  try {
    const r = await post(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', { email, password });
    if (r.ok) { location.replace('/'); return; }
    showErr(r.error || `登录失败（${r.status}）`);
    if (r.status === 401) { pwIn.value = ''; pwIn.focus(); }
  } catch {
    showErr(navigator.onLine ? '无法连接服务器，请稍后再试' : '当前离线，登录需要联网');
  }
  submit.disabled = false; submit.textContent = mode === 'login' ? '登录' : '注册并登录';
});

toggle.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
fetch('/api/auth/config', { credentials: 'same-origin' }).then(r => r.json()).then(c => {
  if (c?.signup) { toggle.hidden = false; $('foot').textContent = '忘记密码请联系管理员在服务器上重置'; }
}).catch(() => { /* 离线 */ });
emailIn.focus({ preventScroll: true });
