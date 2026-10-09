import { S } from '../../data/store';
import { RENDER, ui, bigHTML, money, segHTML, empty, countUp, initSegs, catIco } from '../app';
import { $, $$, dataP, esc, raf2 } from '../dom';
import { ico } from '../icons';
import { bookTx, getCat } from '../../core/ledger';
import { sumAmt } from '../../core/money';
import { curYM, md, parseD, today } from '../../core/dates';
import { inRange, periodRange, shiftAnchor } from '../../core/stats';
import { barSVG, bindBars } from '../charts';
import { catTone } from '../../core/tones';

const SHADE = [1, .7, .5, .36, .25, .17, .11, .07];
export const shade = (i: number) => `rgba(var(--accent-rgb),${SHADE[Math.min(i, SHADE.length - 1)]})`;

RENDER.stats = function () {
  const el = document.getElementById('p-stats')!; const type = ui.statType, p = ui.period, ws = S.settings.weekStart, T = today();
  const R0 = periodRange(p, ui.anchor, ws);
  const L = bookTx(S).filter(t => t.type === type && inRange(t, R0)); const total = sumAmt(L);
  const Rp = periodRange(p, shiftAnchor(p, ui.anchor, -1), ws); const prev = sumAmt(bookTx(S).filter(t => t.type === type && inRange(t, Rp)));
  const canNext = shiftAnchor(p, R0.start, 1) <= T;
  const daysPassed = Math.max(1, Math.min(Math.round((parseD(T).getTime() - parseD(R0.start).getTime()) / 864e5) + 1, Math.round((parseD(R0.end).getTime() - parseD(R0.start).getTime()) / 864e5) + 1));
  const byCat = S.cats[type].map(c => ({ ...c, v: sumAmt(L.filter(t => t.cat === c.id)), n: L.filter(t => t.cat === c.id).length, color: '' })).filter(c => c.v > 0).sort((a, b) => b.v - a.v);
  // 已删除分类的账单归入「未分类」
  const known = new Set(S.cats[type].map(c => c.id)); const orphan = L.filter(t => !known.has(t.cat || ''));
  if (orphan.length) byCat.push({ id: '__none', name: '未分类', icon: 'tag', shade: 0, v: sumAmt(orphan), n: orphan.length, color: '' });
  const seen: Record<string, number> = {};
  byCat.forEach(c => { const t = c.id === '__none' ? 'slate' : catTone(c); const k = seen[t] = (seen[t] || 0) + 1; c.color = k === 1 ? `var(--${t})` : `color-mix(in srgb,var(--${t}) ${Math.max(35, 100 - (k - 1) * 28)}%,var(--card))`; });
  if (ui.statSel && !byCat.find(c => c.id === ui.statSel)) ui.statSel = null;
  const word = type === 'expense' ? '支出' : '收入'; const diff = prev ? (total - prev) / prev : null;
  const RR = 78, C = 2 * Math.PI * RR, gap = byCat.length > 1 ? 4 : 0; let acc = 0;
  const arcs = byCat.map(c => { const len = Math.max(.5, c.v / total * C - gap); const s = `<circle class="arc ${ui.statSel ? (ui.statSel === c.id ? 'sel' : 'dim') : ''}" data-arc="${esc(c.id)}" cx="98" cy="98" r="${RR}" style="stroke:${c.color}" stroke-dasharray="0 ${C}" data-da="${len} ${C - len}" stroke-dashoffset="${-acc}"><title>${esc(c.name)}</title></circle>`; acc += c.v / total * C; return s; }).join('');
  const sel = byCat.find(c => c.id === ui.statSel);
  const values = R0.units.map(u => sumAmt(L.filter(u.match)));
  const top = [...L].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const unitWord = { week: '每日', month: '每日', year: '每月' }[p];
  const pw = { week: '本周', month: '本月', year: '今年' }[p];
  const isCurP = T >= R0.start && T <= R0.end;
  const maxV = Math.max(0, ...values);
  el.innerHTML = `
    <div class="topbar"><h1 class="title">统计</h1><div class="month"><button data-pnav="-1" aria-label="上一期">${ico('left')}</button><span style="min-width:${p === 'week' ? 118 : 78}px">${R0.label}</span><button data-pnav="1" aria-label="下一期" ${canNext ? '' : 'disabled'}>${ico('right')}</button></div></div>
    <div class="stat-ctl">${segHTML('period', [['week', '周'], ['month', '月'], ['year', '年']], p, '', '统计周期')}${segHTML('statType', [['expense', '支出'], ['income', '收入']], type, '', '收支类型')}</div>
    <div style="padding:20px 2px 4px">
      <div class="eyebrow">${isCurP ? pw : R0.label}总${word}</div>
      <div class="stat-big num" data-count="${total}" data-fmt="big">${bigHTML(0)}</div>
      <div class="stat-sub"><span><b class="num">${L.length}</b> 笔</span>${type === 'expense' ? `<span>日均 <b class="num">${money(Math.round(total / daysPassed))}</b></span>` : ''}${diff !== null ? `<span>较上${p === 'week' ? '周' : p === 'month' ? '月' : '年'} <b class="num ${diff > 0 && type === 'expense' ? 'up' : ''}">${diff > 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)}%</b></span>` : ''}</div>
    </div>
    <div class="card" style="margin-top:22px;animation-delay:60ms">
      <div class="card-h"><h3>${word}构成</h3><span>点击分类查看明细</span></div>
      ${byCat.length ? `<div class="donut-wrap"><svg viewBox="0 0 196 196" role="img" aria-label="${word}构成环形图"><circle cx="98" cy="98" r="${RR}" fill="none" style="stroke:var(--fill)" stroke-width="14"></circle>${arcs}</svg>
        <div class="donut-center"><span class="n">${sel ? esc(sel.name) : '总' + word}</span><span class="v num">${money(sel ? sel.v : total)}</span><span class="p">${sel ? (sel.v / total * 100).toFixed(1) + '% · ' + sel.n + ' 笔' : byCat.length + ' 个分类'}</span></div></div>
        <div class="legend">${byCat.map(c => `<div class="lg" role="button" tabindex="0" ${c.id === '__none' ? '' : `data-go="catDetail" data-p="${dataP({ cat: c.id, period: p, anchor: ui.anchor })}"`}><span class="dot" style="background:${c.color}"></span><span class="nm">${esc(c.name)}</span><span class="pc num">${(c.v / total * 100).toFixed(1)}%</span><span class="v num">${money(c.v)}</span>${ico('right', 'ico chev')}</div>`).join('')}</div>`
      : empty('pie', `${R0.label}暂无${word}记录`)}
    </div>
    <div class="card bars" style="animation-delay:120ms;position:relative">
      <div class="card-h"><h3>${unitWord}${word}</h3><span class="num">峰值 ${money(maxV)}</span></div>
      ${barSVG(values, R0.units.map(u => u.label), { hi: i => R0.units[i].key === T || R0.units[i].key === curYM() || (maxV > 0 && values[i] === maxV), label: `${unitWord}${word}柱状图` })}
    </div>
    ${top.length ? `<div class="card rank" style="animation-delay:180ms"><div class="card-h"><h3>单笔最高</h3><span>Top ${top.length}</span></div>
      ${top.map((t, i) => `<div class="row" role="button" tabindex="0" data-open="${esc(t.id)}"><span class="no">${i + 1}</span>${catIco(t.cat)}<div class="tx-info"><div class="tx-name">${esc(getCat(S, t.cat).name)}</div><div class="tx-note">${esc(t.note) || '无备注'} · ${md(t.date)}</div></div><div class="amt num">${money(t.amount)}</div></div>`).join('')}</div>` : ''}`;
  initSegs(el);
  raf2(() => $$<SVGCircleElement>('circle[data-da]', el).forEach(c => c.setAttribute('stroke-dasharray', c.dataset.da!)));
  countUp(el);
  bindBars($<HTMLElement>('.bars', el), values, (i, v) => `${p === 'year' ? R0.units[i].label : md(R0.units[i].key)}  ${money(v)}`);
  $$<SVGCircleElement>('circle.arc', el).forEach(c => c.addEventListener('click', () => { ui.statSel = ui.statSel === c.dataset.arc ? null : c.dataset.arc!; RENDER.stats(); }));
};
