import { S } from '../../data/store';
import { RENDER, bigHTML, money, empty, countUp, acctIco, sampleTag } from '../app';
import { dataP, esc } from '../dom';
import { ico } from '../icons';
import { balance, netWorth, sortedAccounts } from '../../core/ledger';
import { ACCT_TYPES } from '../../core/constants';

RENDER.assets = function () {
  const el = document.getElementById('p-assets')!; const nw = netWorth(S); const accts = sortedAccounts(S);
  const groups: [string, typeof accts][] = [['资金账户', accts.filter(a => a.type !== 'credit')], ['信用账户', accts.filter(a => a.type === 'credit')]];
  el.innerHTML = `
    <div class="topbar" style="margin-top:18px"><h1 class="title">资产</h1><button class="tool" data-go="acctEdit" aria-label="新增账户">${ico('plus')}</button></div>
    <div class="overview acct-hero hero ink">
      <div class="hero-top"><span class="eyebrow">净资产</span><span class="hero-n">${accts.length} 个账户</span></div>
      <div class="big num" data-count="${nw.net}" data-fmt="big">${bigHTML(0)}</div>
      <div class="pair"><div><div class="eyebrow">资产</div><div class="v num" data-count="${nw.as}">${money(0)}</div></div><div><div class="eyebrow">负债</div><div class="v num" data-count="${nw.li}">${money(0)}</div></div></div>
    </div>
    <div class="quick-acts"><button class="qa" data-act="transfer">${ico('transfer')}转账</button><button class="qa" data-go="acctEdit">${ico('plus')}新增账户</button></div>
    ${accts.length ? groups.filter(g => g[1].length).map(([t, list]) => `<div class="group-t"><span>${t}</span><span class="num">${money(list.reduce((a, x) => a + balance(S, x.id), 0))}</span></div>
      <div class="group">${list.map(a => { const b = balance(S, a.id); return `<button class="li" data-go="acct" data-p="${dataP({ id: a.id })}">${acctIco(a)}<span class="grow">${esc(a.name)}${sampleTag(a)}<span class="sm">${ACCT_TYPES[a.type].name}</span></span><span class="rv"><b class="num ${b < 0 ? 'neg' : ''}">${money(b)}</b>${ico('right')}</span></button>`; }).join('')}</div>`).join('')
      : empty('wallet', '还没有账户<br/>添加现金、银行卡、微信、支付宝等账户', `<div style="margin-top:18px"><button class="btn" style="width:auto;padding:0 22px;display:inline-flex" data-go="acctEdit">新增账户</button></div>`)}
    <div class="hint">余额 = 初始余额 + 收入 − 支出 ± 转账，统计全部账本</div>`;
  countUp(el);
};
