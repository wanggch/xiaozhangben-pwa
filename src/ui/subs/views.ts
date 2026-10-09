/** 二级页：账单详情、搜索、日历、分类明细 */
import { S, save } from '../../data/store';
import { SUB, ui, money, empty, txIco, txTitle, txRow, groupList, catIco, openSheet, closeSheet, segHTML, segVal, renderSub, top, type SubPage } from '../app';
import { $, $$, dataP, esc } from '../dom';
import { ico } from '../icons';
import { acctName, bookTx, getCat, monthTx, totals } from '../../core/ledger';
import { fmt2, short, sumAmt, parseCents } from '../../core/money';
import { addDays, curYM, daysIn, fullDate, pad, today, ymAdd, ymLabel } from '../../core/dates';
import { inRange, periodRange, type Period } from '../../core/stats';
import { TYPE_NAME } from '../../core/constants';
import { barSVG, bindBars } from '../charts';
import { bindRows } from '../gestures';

const kvRow = (k: string, v: string) => `<div class="li"><span style="color:var(--sub);font-weight:400">${k}</span><span class="rv" style="color:var(--text);white-space:normal;text-align:right">${v}</span></div>`;

/* 账单详情 */
SUB.detail = ({ id }) => {
  const t = S.tx.find(x => x.id === id);
  if (!t) return { title: '账单详情', body: empty('receipt', '这笔账单已被删除') };
  const r = t.recurId && S.recurs.find(x => x.id === t.recurId);
  const rows: [string, string][] = [
    ['类型', TYPE_NAME[t.type]],
    ...(t.type === 'transfer' ? [['转出账户', esc(acctName(S, t.acct))], ['转入账户', esc(acctName(S, t.toAcct))]] as [string, string][] : [['分类', esc(getCat(S, t.cat).name)], ['账户', t.acct ? esc(acctName(S, t.acct)) : '未选择']] as [string, string][]),
    ['日期', fullDate(t.date)],
    ['备注', esc(t.note) || '无'],
  ];
  return {
    title: '账单详情', right: `<button class="htxt" data-act="editTx" data-id="${esc(t.id)}">编辑</button>`, body: `
    <div class="dt-top">${txIco(t)}<div class="n">${esc(txTitle(t))}${t.sample ? ' · 示例数据' : ''}</div><div class="a num" style="color:${t.type === 'income' ? 'var(--accent)' : 'inherit'}">${t.type === 'transfer' ? '' : t.type === 'income' ? '+' : '-'}${money(t.amount)}</div></div>
    <div class="group">${rows.map(([k, v]) => kvRow(k, v)).join('')}</div>
    <div class="group" style="animation-delay:60ms">
      <button class="li" data-act="moveBook" data-id="${esc(t.id)}"><span style="color:var(--sub);font-weight:400">所属账本</span><span class="rv"><b style="font-weight:500">${esc(S.books.find(b => b.id === t.book)?.name || '')}</b>${ico('right')}</span></button>
      ${r ? `<button class="li" data-go="recurEdit" data-p="${dataP({ id: r.id })}"><span style="color:var(--sub);font-weight:400">来源</span><span class="rv">周期账单 · ${esc(r.name)}${ico('right')}</span></button>` : ''}
      <div class="li"><span style="color:var(--sub);font-weight:400">记录时间</span><span class="rv">${new Date(t.ts).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
    </div>
    <div class="dt-acts"><button data-act="editTx" data-id="${esc(t.id)}">${ico('edit')}编辑</button><button data-act="copyTx" data-id="${esc(t.id)}">${ico('copy')}复制一笔</button><button class="del" data-act="delTx" data-id="${esc(t.id)}">${ico('trash')}删除</button></div>`,
  };
};

/* 搜索 */
export const filterCount = () => { const f = ui.search; return (f.type !== 'all' ? 1 : 0) + (f.cats.length ? 1 : 0) + ((f.min || f.max) ? 1 : 0) + ((f.from || f.to) ? 1 : 0); };
export function searchResults() {
  const f = ui.search, q = f.q.trim().toLowerCase();
  const min = f.min !== '' ? parseCents(f.min) : null, max = f.max !== '' ? parseCents(f.max) : null;
  return bookTx(S).filter(t => {
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.cats.length && !f.cats.includes(t.cat || '')) return false;
    if (min !== null && t.amount < min) return false;
    if (max !== null && t.amount > max) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (q) { const hay = [t.note, txTitle(t), acctName(S, t.acct), t.toAcct ? acctName(S, t.toAcct) : '', (t.amount / 100).toString(), fmt2(t.amount)].join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
}
export function addHistory(q: string) { q = q.trim(); if (!q) return; S.meta.history = [q, ...S.meta.history.filter(h => h !== q)].slice(0, 8); save(); }
export const QUICK_RANGES = (): [string, string, string][] => {
  const T = today(), ym = curYM(), m0 = ym + '-01'; const pm = ymAdd(ym, -1);
  return [['本月', m0, T], ['上月', pm + '-01', `${pm}-${pad(daysIn(pm))}`], ['近 30 天', addDays(T, -29), T], ['今年', T.slice(0, 4) + '-01-01', T]];
};
SUB.search = (_p, pg) => {
  pg.refresh = () => renderSearchOut(pg.el);
  return {
    title: '搜索账单', body: `
    <div class="search-bar" role="search">${ico('search')}<input id="sq" type="search" aria-label="搜索账单" placeholder="备注、分类、账户或金额" value="${esc(ui.search.q)}" enterkeyhint="search" autocomplete="off"/><button class="clr" data-act="sclear" aria-label="清除">${ico('x')}</button></div>
    <div class="filter-bar" id="sfbar"></div>
    <div id="sout" aria-live="polite"></div>`,
    mount(el) {
      const inp = $<HTMLInputElement>('#sq', el); let tm: number | undefined;
      inp.addEventListener('input', () => { ui.search.q = inp.value; clearTimeout(tm); tm = window.setTimeout(() => renderSearchOut(el), 120); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { addHistory(inp.value); renderSearchOut(el); inp.blur(); } });
      setTimeout(() => { if (el.isConnected && !ui.search.q) inp.focus({ preventScroll: true }); }, 520);
      renderSearchOut(el);
    },
  };
};
export function renderSearchOut(el: HTMLElement) {
  const f = ui.search, n = filterCount(), qr = QUICK_RANGES();
  const rangeOn = qr.find(r => r[1] === f.from && r[2] === f.to);
  $('#sfbar', el).innerHTML = `<button class="chip ${n ? 'on' : ''}" data-act="sfilter">${ico('sliders')}筛选${n ? ` <span class="badge">${n}</span>` : ''}</button>
    ${qr.map(r => `<button class="chip ${rangeOn === r ? 'on' : ''}" data-range="${r[1]}|${r[2]}">${r[0]}</button>`).join('')}
    ${[['expense', '支出'], ['income', '收入']].map(([v, nm]) => `<button class="chip ${f.type === v ? 'on' : ''}" data-stype="${v}">${nm}</button>`).join('')}`;
  const out = $('#sout', el); const active = f.q.trim() || n;
  if (!active) {
    out.innerHTML = `${S.meta.history.length ? `<div class="group-t"><span>搜索历史</span><button data-act="hclear">清除</button></div><div class="chips" style="margin-top:14px">${S.meta.history.map(h => `<button class="chip" data-hist="${esc(h)}">${ico('history')}${esc(h)}</button>`).join('')}</div>` : ''}
      <div class="group-t"><span>按分类找</span></div><div class="chips" style="margin-top:14px">${S.cats.expense.slice(0, 8).map(c => `<button class="chip" data-qcat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
      ${empty('search', '输入关键字，或用筛选组合条件<br/>例如「咖啡」「打车」「199」')}`;
    return;
  }
  const res = searchResults(); const q = f.q.trim();
  // 高亮只作用于文本，不破坏已转义的 HTML 实体
  const hl = q ? (s: string) => { const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); return s.split(/(<[^>]+>|&[a-z#0-9]+;)/i).map(part => /^(<|&[a-z#0-9]+;$)/i.test(part) ? part : part.replace(re, m => `<mark>${m}</mark>`)).join(''); } : undefined;
  out.innerHTML = res.length ? `<div class="res-sum"><span>找到 <b class="num">${res.length}</b> 笔</span><span>支出 <b class="num">${money(sumAmt(res.filter(t => t.type === 'expense')))}</b> · 收入 <b class="num">${money(sumAmt(res.filter(t => t.type === 'income')))}</b></span></div>${groupList(res, { hl })}`
    : empty('search', '没有找到匹配的账单<br/>换个关键字或调整筛选条件');
  bindRows(out);
  $$('.tx-main', out).forEach(m => m.addEventListener('click', () => addHistory(f.q), true));
}
export function filterSheet(el: HTMLElement) {
  const f = ui.search; const T = today();
  const cats = f.type === 'income' ? S.cats.income : f.type === 'expense' ? S.cats.expense : [...S.cats.expense, ...S.cats.income.filter(c => c.id !== 'iother')];
  openSheet(`<h3 tabindex="-1">筛选条件</h3><p class="d">多个条件同时生效</p>
    <div class="scroll">
    <div class="lbl2">类型</div>${segHTML('ftype', [['all', '全部'], ['expense', '支出'], ['income', '收入'], ['transfer', '转账']], f.type)}
    <div class="lbl2" style="margin-top:18px">分类（可多选）</div><div class="chips" id="fcats">${cats.map(c => `<button class="chip ${f.cats.includes(c.id) ? 'on' : ''}" data-c="${esc(c.id)}" aria-pressed="${f.cats.includes(c.id)}">${esc(c.name)}</button>`).join('')}</div>
    <div class="lbl2" style="margin-top:18px">金额区间</div><div class="two"><input class="input num" id="fmin" type="number" inputmode="decimal" min="0" aria-label="最低金额" placeholder="最低" value="${esc(f.min)}"/><input class="input num" id="fmax" type="number" inputmode="decimal" min="0" aria-label="最高金额" placeholder="最高" value="${esc(f.max)}"/></div>
    <div class="lbl2" style="margin-top:18px">日期范围</div><div class="two"><input class="input" id="ffrom" type="date" aria-label="开始日期" value="${f.from}" max="${T}"/><input class="input" id="fto" type="date" aria-label="结束日期" value="${f.to}" max="${T}"/></div>
    <div class="chips" style="margin-top:10px">${QUICK_RANGES().map(r => `<button class="chip" data-qr="${r[1]}|${r[2]}">${r[0]}</button>`).join('')}</div>
    </div>
    <div class="btns"><button class="btn ghost" data-reset>重置</button><button class="btn" data-ok>查看结果</button></div>`, b => {
    $('#fcats', b).addEventListener('click', e => { const c = (e.target as Element).closest<HTMLElement>('.chip'); if (c) { c.classList.toggle('on'); c.setAttribute('aria-pressed', String(c.classList.contains('on'))); } });
    $$('[data-qr]', b).forEach(c => c.onclick = () => { const [a, z] = c.dataset.qr!.split('|'); $<HTMLInputElement>('#ffrom', b).value = a; $<HTMLInputElement>('#fto', b).value = z; });
    $('[data-reset]', b).onclick = () => { Object.assign(ui.search, { type: 'all', cats: [], min: '', max: '', from: '', to: '' }); closeSheet(); renderSearchOut(el); };
    $('[data-ok]', b).onclick = () => {
      const v = (s: string) => $<HTMLInputElement>(s, b).value;
      Object.assign(ui.search, { type: segVal(b, 'ftype'), cats: $$<HTMLElement>('#fcats .chip.on', b).map(c => c.dataset.c!), min: v('#fmin'), max: v('#fmax'), from: v('#ffrom'), to: v('#fto') });
      if (ui.search.from && ui.search.to && ui.search.from > ui.search.to) [ui.search.from, ui.search.to] = [ui.search.to, ui.search.from];
      if (ui.search.min && ui.search.max && parseCents(ui.search.min) > parseCents(ui.search.max)) [ui.search.min, ui.search.max] = [ui.search.max, ui.search.min];
      closeSheet(); renderSearchOut(el);
    };
  });
}

/* 日历 */
SUB.calendar = (p, pg) => {
  const T = today();
  p.ym ||= ui.month; p.sel ||= (T.startsWith(p.ym) ? T : p.ym + '-01');
  const ym: string = p.ym, n = daysIn(ym), ws = S.settings.weekStart;
  const L = monthTx(S, ym); const byDay: Record<string, { e: number; i: number; n: number }> = {};
  L.forEach(t => { const d = byDay[t.date] ||= { e: 0, i: 0, n: 0 }; if (t.type === 'expense') d.e += t.amount; if (t.type === 'income') d.i += t.amount; d.n++; });
  const maxE = Math.max(1, ...Object.values(byDay).map(d => d.e));
  const lead = (new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).getDay() - ws + 7) % 7;
  const heads = Array.from({ length: 7 }, (_, i) => '日一二三四五六'[(i + ws) % 7]);
  const cells = Array(lead).fill('<div class="cd blank"></div>').concat(Array.from({ length: n }, (_, i) => {
    const d = `${ym}-${pad(i + 1)}`, v = byDay[d];
    return `<button class="cd ${d === T ? 'today' : ''} ${d === p.sel ? 'sel' : ''} ${d > T ? 'future' : ''}" data-d="${d}" aria-label="${i + 1}日${v && v.e ? ' 支出' + fmt2(v.e) : ''}" style="--h:${v && v.e ? (.05 + v.e / maxE * .3).toFixed(3) : 0}"><span class="dn">${i + 1}</span>${v && v.e ? `<span class="de">-${short(v.e)}</span>` : ''}${v && v.i ? '<i class="di"></i>' : ''}</button>`;
  })).join('');
  const { exp, inc } = totals(S, ym);
  return {
    title: '日历', right: `<button class="htxt" data-act="calToday">今天</button>`, body: `
    <div class="cal-head"><div style="font-size:22px;font-weight:650;letter-spacing:-.02em">${ymLabel(ym)}</div><div class="month"><button data-cal="-1" aria-label="上个月">${ico('left')}</button><button data-cal="1" aria-label="下个月" ${ym >= curYM() ? 'disabled' : ''}>${ico('right')}</button></div></div>
    <div class="cal-sum"><span>支出 <b class="num">${money(exp)}</b></span><span>收入 <b class="num">${money(inc)}</b></span><span>记账 <b class="num">${Object.keys(byDay).length}</b> 天</span></div>
    <div class="card" style="margin-top:0;padding:16px 12px"><div class="cal-w" aria-hidden="true">${heads.map(h => `<span>${h}</span>`).join('')}</div><div class="cal">${cells}</div></div>
    <div class="day-detail" id="dayDetail"></div>`,
    mount(el) {
      const show = (d: string) => { p.sel = d; $$('.cd', el).forEach(c => c.classList.toggle('sel', c.dataset.d === d)); renderDayDetail(el, d); };
      $$('.cd[data-d]', el).forEach(c => c.addEventListener('click', () => show(c.dataset.d!)));
      $$<HTMLButtonElement>('[data-cal]', el).forEach(b => b.addEventListener('click', () => { if (b.disabled) return; p.ym = ymAdd(p.ym, +b.dataset.cal!); p.sel = null; renderSub(pg); }));
      // 左右滑动切换月份
      const card = $('.cal', el).parentElement!; let sx = 0, sy = 0;
      card.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
      card.addEventListener('pointerup', e => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && sx > 30) { const k = dx < 0 ? 1 : -1; if (k > 0 && p.ym >= curYM()) return; p.ym = ymAdd(p.ym, k); p.sel = null; renderSub(pg); } });
      renderDayDetail(el, p.sel);
    },
  };
};
function renderDayDetail(el: HTMLElement, d: string) {
  const L = bookTx(S).filter(t => t.date === d); const e = sumAmt(L.filter(t => t.type === 'expense')), i = sumAmt(L.filter(t => t.type === 'income'));
  const box = $('#dayDetail', el);
  box.innerHTML = `<div class="card-h" style="margin:0 2px 10px"><h3>${fullDate(d)}</h3><span class="num">${e ? '支 ' + money(e) : ''}${e && i ? ' · ' : ''}${i ? '收 ' + money(i) : ''}</span></div>
    ${L.length ? `<div class="day-card">${[...L].sort((a, b) => b.ts - a.ts).map(t => txRow(t)).join('')}</div>` : `<div class="empty" style="padding:26px 0 10px">这一天没有记录</div>`}
    ${d <= today() ? `<button class="btn line" data-act="recOnDay" data-d="${d}">${ico('plus')}在这天记一笔</button>` : ''}`;
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = 'rise .4s var(--ease) both';
  bindRows(box);
}
export const calToday = () => { const pg = top() as SubPage; pg.params.ym = curYM(); pg.params.sel = today(); renderSub(pg); };

/* 分类明细 */
SUB.catDetail = ({ cat, period, anchor }: { cat: string; period: Period; anchor: string }) => {
  const c = getCat(S, cat); const R0 = periodRange(period, anchor, S.settings.weekStart);
  const all = bookTx(S).filter(t => t.cat === cat && t.type === c.type);
  const L = all.filter(t => inRange(t, R0)); const total = sumAmt(L);
  const typeTotal = sumAmt(bookTx(S).filter(t => t.type === c.type && inRange(t, R0)));
  const months = Array.from({ length: 6 }, (_, i) => ymAdd(curYM(), i - 5));
  const trend = months.map(m => sumAmt(all.filter(t => t.date.startsWith(m))));
  return {
    title: esc(c.name), body: `
    <div class="dt-top" style="padding-bottom:18px">${catIco(cat)}<div class="n">${R0.label} · ${c.type === 'expense' ? '支出' : '收入'}</div><div class="a num">${money(total)}</div></div>
    <div class="group"><div class="mini" style="margin:0;border:0;padding:16px 0;grid-template-columns:repeat(3,1fr)"><div><b class="num">${L.length}</b><span>笔数</span></div><div><b class="num">${typeTotal ? (total / typeTotal * 100).toFixed(1) : 0}%</b><span>占比</span></div><div><b class="num">${money(L.length ? Math.round(total / L.length) : 0)}</b><span>平均每笔</span></div></div></div>
    <div class="card bars" style="position:relative"><div class="card-h"><h3>近 6 个月趋势</h3><span class="num">月均 ${money(Math.round(trend.reduce((a, v) => a + v, 0) / 6))}</span></div>
      ${barSVG(trend, months.map(m => +m.slice(5) + '月'), { hi: i => i === 5, label: '近 6 个月趋势' })}</div>
    <div class="group-t"><span>${R0.label} 明细</span></div>
    ${L.length ? groupList(L) : empty('receipt', '这段时间没有记录')}`,
    mount(el) { bindRows(el); bindBars($<HTMLElement>('.bars', el), trend, (i, v) => `${ymLabel(months[i])}  ${money(v)}`); },
  };
};
