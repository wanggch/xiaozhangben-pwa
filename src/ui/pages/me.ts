import { S } from '../../data/store';
import { RENDER, money, countUp } from '../app';
import { esc } from '../dom';
import { ico } from '../icons';
import { getBook, netWorth } from '../../core/ledger';
import { APP_VERSION } from '../../version';
import { accountEmail, syncLabel } from '../subs/account';
import { sync, onSyncChange } from '../../sync/engine';

const syncDot = () => sync.status === 'ok' && !sync.pending ? 'ok' : sync.status === 'error' || sync.status === 'auth' ? 'err' : sync.status === 'syncing' ? 'busy' : 'idle';
onSyncChange(() => {
  const s = document.getElementById('meSync'); if (!s) return;
  s.textContent = syncLabel(); const d = s.previousElementSibling; if (d) d.className = `sync-dot ${syncDot()}`;
});

RENDER.me = function () {
  const el = document.getElementById('p-me')!; const days = new Set(S.tx.map(t => t.date)).size; const nw = netWorth(S);
  const li = (icon: string, name: string, rv: string, go: string, tone = 'slate') => `<button class="li" ${go}>${ico(icon, 'ico li-ico t-' + tone)}<span class="grow">${name}</span><span class="rv">${rv}${ico('right')}</span></button>`;
  el.innerHTML = `
    <div class="topbar" style="margin-top:18px"><h1 class="title">我的</h1><button class="tool" data-go="settings" aria-label="设置">${ico('gear')}</button></div>
    <div class="card me-card" style="margin-top:0">
      <div class="profile"><div class="avatar" aria-hidden="true">${esc((accountEmail()[0] || '我').toUpperCase())}</div><div><h2 class="acct-email">${esc(accountEmail() || '我的账本')}</h2><p>${esc(getBook(S).name)} · 已记账 ${days} 天</p></div></div>
      <div class="mini"><div><b class="num" data-count="${nw.net}">0</b><span>净资产</span></div><div><b class="num" data-count="${S.tx.length}" data-fmt="int">0</b><span>总笔数</span></div><div><b class="num" data-count="${days}" data-fmt="int">0</b><span>记账天数</span></div></div>
    </div>
    <div class="group" style="animation-delay:40ms">
      ${li('cloud', '账号与同步', `<i class="sync-dot ${syncDot()}" aria-hidden="true"></i><span id="meSync">${syncLabel()}</span>`, 'data-go="account"', 'sky')}
    </div>
    <div class="group" style="animation-delay:60ms">
      ${li('book', '账本', `${S.books.length} 个`, 'data-go="books"', 'indigo')}
      ${li('target', '预算', getBook(S).budget ? `<span class="num">${money(getBook(S).budget)}</span>` : '未设置', 'data-go="budget"', 'coral')}
      ${li('grid', '分类管理', '', 'data-go="cats"', 'violet')}
      ${li('repeat', '周期记账', `${S.recurs.filter(r => r.on).length} 条启用`, 'data-go="recurs"', 'teal')}
      ${li('calendar', '日历', '', 'data-go="calendar"', 'rose')}
    </div>
    <div class="group" style="animation-delay:120ms">
      ${li('gear', '设置', '', 'data-go="settings"')}
      ${li('phone', '添加到主屏幕', '', 'data-go="install"', 'green')}
      ${li('sparkle', '重新查看引导', '', 'data-act="onboard"', 'amber')}
      ${li('info', '关于小账本', 'v' + APP_VERSION, 'data-go="about"', 'indigo')}
    </div>
    <div class="hint" style="margin-top:28px">数据保存在本机，离线可用 · 联网后自动同步</div>`;
  countUp(el);
};
