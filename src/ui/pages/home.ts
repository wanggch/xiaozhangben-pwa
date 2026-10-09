import { S } from '../../data/store';
import { RENDER, ui, bigHTML, money, monthPill, groupList, empty, countUp, growBars, catIco } from '../app';
import { esc } from '../dom';
import { ico } from '../icons';
import { getBook, totals, hasSample } from '../../core/ledger';
import { curYM, md, today, ymLabel } from '../../core/dates';
import { pendingRecurs } from '../../core/recurring';
import { bindRows } from '../gestures';
import { installTipHTML } from '../../pwa/install';

RENDER.home = function () {
  const el = document.getElementById('p-home')!; const { exp, inc, list } = totals(S, ui.month); const bal = inc - exp;
  const isCur = ui.month === curYM(); const B = getBook(S).budget; const pct = B ? exp / B : 0;
  const shown = list.filter(t => ui.filter === 'all' || t.type === ui.filter);
  const due = pendingRecurs(S, today());
  el.innerHTML = `
    <div class="toprow"><button class="book-btn" data-act="bookSwitch" aria-label="切换账本，当前：${esc(getBook(S).name)}">${ico('book')}${esc(getBook(S).name)}${ico('down')}</button>
      <div class="tools"><button class="tool" data-go="search" aria-label="搜索">${ico('search')}</button><button class="tool" data-go="calendar" aria-label="日历">${ico('calendar')}</button></div></div>
    <div class="topbar"><h1 class="title">账单</h1>${monthPill()}</div>
    <div class="overview hero">
      <div class="hero-top"><span class="eyebrow">${isCur ? '本月支出' : ymLabel(ui.month) + ' 支出'}</span>${list.length ? `<span class="hero-n num">${list.length} 笔</span>` : ''}</div>
      <div class="big num" data-count="${exp}" data-fmt="big">${bigHTML(0)}</div>
      <div class="pair">
        <div><div class="eyebrow">收入</div><div class="v num" data-count="${inc}">${money(0)}</div></div>
        <div><div class="eyebrow">结余</div><div class="v num" data-count="${bal}">${money(0)}</div></div>
      </div>
      ${isCur && B ? `<div class="budget-line" data-go="budget" role="button" tabindex="0" aria-label="月预算 ${money(B)}，${pct > 1 ? '已超支' : '已用 ' + Math.round(pct * 100) + '%'}"><div class="meta"><span>月预算 <span class="num">${money(B)}</span> · 已用 <span class="num">${Math.round(pct * 100)}%</span></span><span class="num ${pct > 1 ? 'over' : ''}">${pct > 1 ? '超支 ' + money(exp - B) : '剩余 ' + money(B - exp)}</span></div><div class="track"><i class="${pct > 1 ? 'over' : ''}" data-w="${Math.min(100, pct * 100)}"></i></div></div>`
        : isCur ? `<button class="budget-set" data-go="budget">${ico('target')}设置月预算，掌握花销节奏${ico('right')}</button>` : ''}
    </div>
    ${S.meta.sampleTip && hasSample(S) ? `<div class="sample-tip"><span class="dot"></span>当前为示例数据，可在「设置」中清除<button data-act="hideTip">知道了</button></div>` : ''}
    ${installTipHTML()}
    ${due.map(r => `<div class="due">${catIco(r.cat)}<div><div class="t">${esc(r.name)} <span class="num" style="font-weight:500">${money(r.amount)}</span></div><div class="s">周期账单 · ${r.next === today() ? '今天到期' : md(r.next) + ' 已到期'}</div></div>
      <div class="acts"><button class="mini-btn" data-due-skip="${esc(r.id)}">跳过</button><button class="mini-btn pri" data-due-ok="${esc(r.id)}">记一笔</button></div></div>`).join('')}
    <div class="filters" role="tablist">${[['all', '全部'], ['expense', '支出'], ['income', '收入'], ['transfer', '转账']].map(([v, n]) => `<button role="tab" aria-selected="${ui.filter === v}" class="${ui.filter === v ? 'on' : ''}" data-filter="${v}">${n}</button>`).join('')}</div>
    ${shown.length ? groupList(shown) : empty('receipt', list.length ? '没有符合条件的记录' : '这个月还没有记录<br/>点击下方 + 记下第一笔')}
    ${shown.length ? `<div class="hint">左滑删除 · 点击查看详情</div>` : ''}`;
  growBars(el); countUp(el); bindRows(el);
};
