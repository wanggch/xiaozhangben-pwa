/** 周期记账 */
import { S, save } from '../../data/store';
import { SUB, ui, catIco, empty, segHTML, segVal, sampleTag, pop, refresh, toast } from '../app';
import { $, $$, dataP, esc } from '../dom';
import { ico } from '../icons';
import { fmt2, parseCents } from '../../core/money';
import { md, parseD, today } from '../../core/dates';
import { freqText, runRecurring } from '../../core/recurring';
import { ACCT_TYPES, FREQ } from '../../core/constants';
import { defaultRecAcct, sortedAccounts } from '../../core/ledger';
import { uid } from '../../core/id';
import type { CatType, Freq, Recur } from '../../core/types';

const rows = () => {
  const all = S.recurs.filter(r => r.book === S.meta.curBook); const f = ui.rcFilter || 'all'; const T = today();
  const list = all.filter(r => f === 'all' || r.mode === f);
  if (!list.length) return all.length ? empty('repeat', f === 'auto' ? '没有自动记账的规则' : '没有到期提醒的规则') : empty('repeat', '还没有周期账单', `<div style="margin-top:18px"><button class="btn" style="width:auto;padding:0 22px;display:inline-flex" data-go="recurEdit">新增周期账单</button></div>`);
  return `<div class="group">${list.map(r => `<div class="li rc ${r.on ? '' : 'dim'}" role="button" tabindex="0" style="cursor:pointer" data-go="recurEdit" data-p="${dataP({ id: r.id })}">${catIco(r.cat)}<span class="grow"><span class="nm"><span class="t">${esc(r.name)}</span>${sampleTag(r)}</span><span class="sm">${freqText(r)} · ${r.mode === 'auto' ? '自动' : '提醒'}</span></span>
    <span class="rc-rv"><b class="num">${r.type === 'income' ? '+' : '-'}${fmt2(r.amount)}</b><small>${r.on ? '下次 ' + (r.next === T ? '今天' : md(r.next)) : '已暂停'}</small></span><button class="switch ${r.on ? 'on' : ''}" role="switch" aria-checked="${r.on}" data-rtoggle="${esc(r.id)}" aria-label="启用「${esc(r.name)}」"></button></div>`).join('')}</div>`;
};
SUB.recurs = () => {
  const all = S.recurs.filter(r => r.book === S.meta.curBook); const f = ui.rcFilter || 'all';
  const head = all.length ? `<div class="rc-head"><p class="rc-tip">固定账单到期后自动入账，或在首页提醒你确认</p>
    <div class="rc-bar">${segHTML('rcFilter', [['all', '全部'], ['auto', '自动记账'], ['remind', '到期提醒']], f, 'sm', '筛选')}<span class="rc-count">已启用 <b class="num">${all.filter(r => r.on).length}</b> / ${all.length}</span></div></div>` : '';
  return {
    title: '周期记账', right: `<button class="hbtn" data-go="recurEdit" aria-label="新增周期账单">${ico('plus')}</button>`,
    body: head + `<div id="rcList">${rows()}</div>`,
    mount(el) { $('.seg[data-seg="rcFilter"]', el)?.addEventListener('segchange', e => { ui.rcFilter = (e as CustomEvent).detail; $('#rcList', el).innerHTML = rows(); }); },
  };
};
SUB.recurEdit = (p = {}) => {
  const r = p.id ? S.recurs.find(x => x.id === p.id) : null; const T = today();
  const v: Partial<Recur> & { type: CatType; cat: string; acct: string | null; freq: Freq; mode: 'auto' | 'remind' } = r ? { ...r } : { type: 'expense', name: '', cat: S.cats.expense[0]?.id || 'other', acct: defaultRecAcct(S), freq: 'month', start: T, mode: 'auto', on: true };
  const catChips = (type: CatType) => S.cats[type].map(c => `<button class="chip ${c.id === v.cat ? 'on' : ''}" data-c="${esc(c.id)}">${ico(c.icon)}${esc(c.name)}</button>`).join('');
  return {
    title: r ? '编辑周期账单' : '新增周期账单', right: `<button class="htxt" data-act="saveRecur">保存</button>`, body: `
    <div style="display:flex;justify-content:center;margin-top:6px">${segHTML('rType', [['expense', '支出'], ['income', '收入']], v.type)}</div>
    <div class="field"><label for="rName">名称</label><input class="input" id="rName" maxlength="16" placeholder="例如：房租、视频会员" value="${esc(v.name)}"/></div>
    <div class="field"><label for="rAmt">金额</label><input class="input big" id="rAmt" type="text" inputmode="decimal" placeholder="0.00" value="${r ? r.amount / 100 : ''}"/></div>
    <div class="field"><label>分类</label><div class="chips" id="rCats">${catChips(v.type)}</div></div>
    <div class="field"><label>账户</label><div class="chips" id="rAcct"><button class="chip ${!v.acct ? 'on' : ''}" data-a="">不选择</button>${sortedAccounts(S).map(a => `<button class="chip ${a.id === v.acct ? 'on' : ''}" data-a="${esc(a.id)}">${ico(ACCT_TYPES[a.type].icon)}${esc(a.name)}</button>`).join('')}</div></div>
    <div class="field"><label>重复周期</label>${segHTML('rFreq', Object.entries(FREQ), v.freq)}</div>
    <div class="field"><label for="rStart">${r ? '下次日期' : '首次日期'}</label><input class="input" id="rStart" type="date" value="${r ? r.next : v.start}"/></div>
    <div class="field"><label>到期时</label>${segHTML('rMode', [['auto', '自动记账'], ['remind', '提醒我确认']], v.mode)}</div>
    <p class="hint" style="text-align:left;margin-top:12px">自动记账：到期当天打开 App 时自动生成账单；提醒：在账单首页显示待确认卡片</p>
    ${r ? `<button class="btn line" style="color:var(--danger);margin-top:26px" data-act="delRecur" data-id="${esc(r.id)}">${ico('trash')}删除周期账单</button>` : ''}`,
    mount(el, pg) {
      $('.seg[data-seg="rType"]', el).addEventListener('segchange', e => { const t = (e as CustomEvent).detail as CatType; v.type = t; v.cat = S.cats[t][0]?.id; $('#rCats', el).innerHTML = catChips(t); });
      ['#rCats', '#rAcct'].forEach(s => $(s, el).addEventListener('click', e => { const c = (e.target as Element).closest('.chip'); if (!c) return; $$(s + ' .chip', el).forEach(x => x.classList.toggle('on', x === c)); }));
      pg.save = () => {
        const name = $<HTMLInputElement>('#rName', el).value.trim(), amount = Math.abs(parseCents($<HTMLInputElement>('#rAmt', el).value)), start = $<HTMLInputElement>('#rStart', el).value || today();
        if (!name) { toast('请填写名称', 'warn'); return; } if (!(amount > 0)) { toast('请填写金额', 'warn'); return; }
        const type = segVal(el, 'rType') as CatType;
        const o = {
          name, amount, type, cat: $<HTMLElement>('#rCats .chip.on', el)?.dataset.c || S.cats[type][0]?.id || (type === 'income' ? 'iother' : 'other'), acct: $<HTMLElement>('#rAcct .chip.on', el)?.dataset.a || null,
          freq: segVal(el, 'rFreq') as Freq, mode: segVal(el, 'rMode') as 'auto' | 'remind', dom: parseD(start).getDate(), next: start,
        };
        if (r) { Object.assign(r, o); if (o.freq === 'week' || o.freq === 'year') r.start = start; delete r.sample; } else S.recurs.push({ id: 'r' + uid(), book: S.meta.curBook, on: true, start, ...o });
        const n = runRecurring(S, today()); save(); pop(); refresh();
        toast(n ? `已保存，并自动生成 ${n} 笔到期账单` : (r ? '周期账单已更新' : '已新增周期账单'));
      };
    },
  };
};

