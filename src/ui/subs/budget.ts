/** 预算 / 分类预算 */
import { S, save } from '../../data/store';
import { SUB, money, catIco, openSheet, closeSheet, refresh, toast, cur } from '../app';
import { $, $$, esc } from '../dom';
import { bookTx, getBook, getCat, totals } from '../../core/ledger';
import { parseCents, sumAmt } from '../../core/money';
import { curYM, daysIn, today, ymAdd } from '../../core/dates';
import { budgetColor, budgetStatus, quickBudgets } from '../../core/budget';

SUB.budget = () => {
  const ym = curYM(); const { exp, list } = totals(S, ym); const bk = getBook(S); const B = bk.budget || 0;
  const st = budgetStatus(exp, B, +today().slice(8), daysIn(ym));
  const { pct, left, remainDays, elapsed } = st;
  const color = budgetColor(pct);
  const R = 58, C = 2 * Math.PI * R;
  let note: string;
  if (!B) note = `<div class="note-line amber"><span class="dot"></span><span>还没有设置月预算，设置后可以追踪花销节奏</span></div>`;
  else if (pct > 1) note = `<div class="note-line red"><span class="dot"></span><span><b>本月已超支 ${money(exp - B)}</b>，接下来 ${remainDays} 天要克制一点</span></div>`;
  else if (pct >= .8) note = `<div class="note-line amber"><span class="dot"></span><span><b>预算已用 ${(pct * 100).toFixed(0)}%</b>，剩余每天约可花 ${money(st.dailyAvail)}</span></div>`;
  else note = `<div class="note-line"><span class="dot"></span><span>${pct <= elapsed ? '<b>节奏不错</b>，花销进度低于时间进度' : '<b>花得略快</b>，比时间进度快 ' + ((pct - elapsed) * 100).toFixed(0) + '%'}（本月已过 ${(elapsed * 100).toFixed(0)}%）</span></div>`;
  const exps = list.filter(t => t.type === 'expense');
  const set = S.cats.expense.filter(c => bk.catBudgets[c.id]);
  return {
    title: `预算 · ${esc(bk.name)}`, body: `
    <div class="card" style="margin-top:6px">
      <div class="bud-hero">
        <div class="ring"><svg viewBox="0 0 128 128" aria-hidden="true"><circle class="trk" cx="64" cy="64" r="${R}"></circle><circle class="val" cx="64" cy="64" r="${R}" style="stroke:${color}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - Math.min(pct, 1))}"></circle></svg>
          <div class="c"><b class="num" data-count="${pct * 100}" data-fmt="pct" style="color:${pct > 1 ? 'var(--danger)' : 'inherit'}">0%</b><span>已使用</span></div></div>
        <div class="kv">
          <div>月预算<b class="num">${B ? money(B) : '未设置'}</b></div>
          <div>已支出<b class="num">${money(exp)}</b></div>
          <div>${left < 0 ? '超支' : '剩余'}<b class="num" style="color:${left < 0 ? 'var(--danger)' : 'inherit'}">${money(Math.abs(left))}</b></div>
          <div>日均可用<b class="num">${money(st.dailyAvail)}</b></div>
        </div>
      </div>
      ${note}
      <button class="btn line" data-act="setBudget">${B ? '调整月预算' : '设置月预算'}</button>
    </div>
    <div class="card" style="animation-delay:80ms">
      <div class="card-h"><h3>分类预算</h3><button class="htxt" style="padding:0" data-go="catBudgets">管理</button></div>
      ${set.length ? set.map(c => {
        const sp = sumAmt(exps.filter(t => t.cat === c.id)); const b = bk.catBudgets[c.id]; const p = sp / b; const over = sp > b;
        return `<div class="cb" role="button" tabindex="0" data-catbud="${esc(c.id)}">${catIco(c.id)}<div class="mid"><div class="t">${esc(c.name)}<span class="num ${over ? 'over' : ''}">${over ? '超支 ' + money(sp - b) : money(sp) + ' / ' + money(b)}</span></div>
          <div class="track"><i data-w="${Math.min(100, p * 100)}" style="background:${over ? 'var(--danger)' : p >= .8 ? 'var(--warn)' : 'var(--accent)'}"></i></div></div></div>`;
      }).join('')
        : `<div class="empty" style="padding:18px 0 6px">还没有分类预算<br/><button class="btn line" style="width:auto;padding:0 20px;display:inline-flex;margin-top:14px" data-go="catBudgets">去设置</button></div>`}
    </div>`,
    mount(el) { requestAnimationFrame(() => requestAnimationFrame(() => { const v = $<SVGCircleElement>('.val', el); v && v.setAttribute('stroke-dashoffset', v.dataset.off!); })); },
  };
};
SUB.catBudgets = () => {
  const bk = getBook(S); const ym = curYM(); const exps = bookTx(S).filter(t => t.type === 'expense' && t.date.startsWith(ym));
  const allocated = Object.entries(bk.catBudgets).filter(([k]) => S.cats.expense.some(c => c.id === k)).reduce((a, [, b]) => a + b, 0); const B = bk.budget || 0;
  const pct = B ? allocated / B : 0;
  return {
    title: '分类预算', body: `
    <div class="card" style="margin-top:6px">
      <div class="eyebrow">已分配</div>
      <div class="stat-big num" style="font-size:34px;margin:8px 0 10px">${money(allocated)}<span style="font-size:15px;color:var(--sub);font-weight:500"> / ${B ? money(B) : '未设总预算'}</span></div>
      <div class="track"><i data-w="${Math.min(100, pct * 100)}" class="${pct > 1 ? 'over' : ''}"></i></div>
      ${B && allocated > B ? `<div class="note-line red"><span class="dot"></span><span><b>分类预算合计超出总预算 ${money(allocated - B)}</b>，建议调低部分分类</span></div>` : B ? `<div class="note-line"><span class="dot"></span><span>还可分配 <b>${money(B - allocated)}</b>，未设置的分类不受限制</span></div>` : ''}
    </div>
    <div class="group-t"><span>点击分类设置本月预算</span></div>
    <div class="group">${S.cats.expense.map(c => {
      const b = bk.catBudgets[c.id]; const sp = sumAmt(exps.filter(t => t.cat === c.id));
      return `<button class="li" data-catbud="${esc(c.id)}">${catIco(c.id)}<span class="grow">${esc(c.name)}<span class="sm num">本月已花 ${money(sp)}</span></span><span class="rv">${b ? `<b class="num ${sp > b ? 'neg' : ''}">${money(b)}</b>` : '未设置'}<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span></button>`;
    }).join('')}</div>`,
  };
};
export function budgetSheet(catId?: string) {
  const bk = getBook(S); const c = catId ? getCat(S, catId) : null; const curV = c ? bk.catBudgets[catId!] : bk.budget;
  let quick: number[], hint = '';
  if (c) {
    const spent = (m: string) => sumAmt(bookTx(S).filter(t => t.type === 'expense' && t.cat === catId && t.date.startsWith(m)));
    const ym = curYM(); const last = spent(ymAdd(ym, -1)), avg3 = Math.round((spent(ymAdd(ym, -1)) + spent(ymAdd(ym, -2)) + spent(ymAdd(ym, -3))) / 3);
    hint = `上月花费 ${money(last)} · 近 3 月平均 ${money(avg3)}`;
    quick = quickBudgets(last, avg3);
  } else quick = [3000, 5000, 8000, 10000];
  openSheet(`<h3 tabindex="-1">${c ? esc(c.name) + '预算' : '月预算 · ' + esc(bk.name)}</h3><p class="d">${c ? hint : '设置每月总支出上限，超出时会提醒你。'}</p>
    <div class="big-in num"><span class="cur">${esc(cur())}</span><input id="budIn" class="num" type="text" inputmode="decimal" aria-label="预算金额" placeholder="0" value="${curV ? (curV / 100).toString() : ''}" /></div>
    <div class="quick">${quick.map(q => `<button class="num" data-q="${q}">${q.toLocaleString()}</button>`).join('')}</div>
    <div class="btns">${curV ? `<button class="btn ghost" data-rm style="color:var(--danger)">移除预算</button>` : `<button class="btn ghost" data-x>取消</button>`}<button class="btn" data-ok>保存</button></div>`, b => {
    const inp = $<HTMLInputElement>('#budIn', b); setTimeout(() => inp.focus({ preventScroll: true }), 380);
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2}).+/, '$1'); });
    $$('[data-q]', b).forEach(q => q.onclick = () => { inp.value = q.dataset.q!; });
    $('[data-x]', b) && ($('[data-x]', b).onclick = closeSheet);
    const apply = (v: number) => {
      if (c) { if (v > 0) bk.catBudgets[catId!] = v; else delete bk.catBudgets[catId!]; } else bk.budget = v;
      delete bk.sampleBudget; save(); closeSheet(); refresh(); toast(v > 0 ? '预算已更新' : '已移除预算');
    };
    $('[data-rm]', b) && ($('[data-rm]', b).onclick = () => apply(0));
    $('[data-ok]', b).onclick = () => apply(Math.max(0, parseCents(inp.value)));
    inp.onkeydown = e => { if (e.key === 'Enter') apply(Math.max(0, parseCents(inp.value))); };
  });
}
