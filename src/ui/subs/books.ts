/** 多账本 */
import { S, save } from '../../data/store';
import { SUB, money, sampleTag, openSheet, closeSheet, refresh, toast, push, confirmSheet, withUndo, ui } from '../app';
import { $, $$, esc } from '../dom';
import { ico } from '../icons';
import { sumAmt } from '../../core/money';
import { curYM } from '../../core/dates';
import { getBook } from '../../core/ledger';
import { uid } from '../../core/id';

SUB.books = () => ({
  title: '账本', right: `<button class="hbtn" data-act="newBook" aria-label="新建账本">${ico('plus')}</button>`, body: `
  <div class="group">${S.books.map(b => {
    const n = S.tx.filter(t => t.book === b.id); return `<div class="li"><button class="grow" style="display:flex;align-items:center;gap:14px;text-align:left" data-book="${esc(b.id)}"><span class="cat-ico ${b.id === S.meta.curBook ? 'sh4' : 'sh0'}">${ico('book')}</span><span class="grow">${esc(b.name)}${sampleTag(b)}<span class="sm">${n.length} 笔 · 本月支出 ${money(sumAmt(n.filter(t => t.type === 'expense' && t.date.startsWith(curYM()))))}</span></span></button>
    ${b.id === S.meta.curBook ? `<span class="check" aria-label="当前账本">${ico('check')}</span>` : ''}<button class="hbtn" data-bookedit="${esc(b.id)}" aria-label="编辑${esc(b.name)}">${ico('more')}</button></div>`;
  }).join('')}
    <button class="li center" data-act="newBook">${ico('plus')}新建账本</button></div>
  <div class="hint">账单、预算、周期账单按账本独立 · 账户在所有账本间共享</div>`,
});
export function bookSheet() {
  openSheet(`<h3 tabindex="-1">切换账本</h3><p class="d">每个账本的账单、预算独立统计</p>
    <div class="group">${S.books.map(b => `<button class="li" data-book="${esc(b.id)}"><span class="cat-ico ${b.id === S.meta.curBook ? 'sh4' : 'sh0'}">${ico('book')}</span><span class="grow">${esc(b.name)}${sampleTag(b)}<span class="sm">${S.tx.filter(t => t.book === b.id).length} 笔</span></span>${b.id === S.meta.curBook ? `<span class="check">${ico('check')}</span>` : ''}</button>`).join('')}</div>
    <div class="btns"><button class="btn ghost" data-manage>管理账本</button><button class="btn" data-new>${ico('plus')}新建账本</button></div>`, b => {
    $('[data-manage]', b).onclick = () => { closeSheet(); push('books'); };
    $('[data-new]', b).onclick = () => bookNameSheet();
  });
}
export function switchBook(id: string) {
  if (id === S.meta.curBook) { closeSheet(); return; }
  S.meta.curBook = id; ui.statSel = null; save(); closeSheet(); refresh(); toast(`已切换到「${esc(getBook(S).name)}」`);
}
export function bookNameSheet(id?: string) {
  const b = id ? S.books.find(x => x.id === id) : undefined;
  openSheet(`<h3 tabindex="-1">${b ? '编辑账本' : '新建账本'}</h3><p class="d">${b ? '重命名或删除这个账本' : '给新账本起个名字，例如旅行、装修、宠物'}</p>
    <input class="input" id="bkName" maxlength="12" aria-label="账本名称" placeholder="账本名称" value="${b ? esc(b.name) : ''}"/>
    ${b ? '' : `<div class="quick">${['旅行', '装修', '宠物', '人情往来', '副业'].map(q => `<button data-q="${q}">${q}</button>`).join('')}</div>`}
    <div class="btns">${b ? `<button class="btn ghost" data-del style="color:var(--danger)">删除</button>` : `<button class="btn ghost" data-x>取消</button>`}<button class="btn" data-ok>${b ? '保存' : '创建'}</button></div>`, sb => {
    const inp = $<HTMLInputElement>('#bkName', sb); setTimeout(() => inp.focus({ preventScroll: true }), 380);
    $$('[data-q]', sb).forEach(q => q.onclick = () => inp.value = q.dataset.q!);
    $('[data-x]', sb) && ($('[data-x]', sb).onclick = closeSheet);
    const ok = () => {
      const name = inp.value.trim(); if (!name) { toast('请填写名称', 'warn'); return; }
      if (b) { b.name = name; delete b.sample; save(); closeSheet(); refresh(); toast('账本已重命名'); }
      else { const nb = { id: 'b' + uid(), name, budget: 0, catBudgets: {}, order: S.books.length }; S.books.push(nb); S.meta.curBook = nb.id; save(); closeSheet(); refresh(); toast(`已创建并切换到「${esc(name)}」`); }
    };
    $('[data-ok]', sb).onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    $('[data-del]', sb) && ($('[data-del]', sb).onclick = () => {
      if (S.books.length <= 1) { toast('至少保留一个账本', 'warn'); return; }
      const n = S.tx.filter(t => t.book === b!.id).length;
      confirmSheet(`删除「${esc(b!.name)}」？`, `账本内的 ${n} 笔账单和周期账单会一并删除。可以在提示中撤销。`, '删除账本', () => withUndo('账本已删除', () => {
        S.tx = S.tx.filter(t => t.book !== b!.id); S.recurs = S.recurs.filter(r => r.book !== b!.id); S.books = S.books.filter(x => x.id !== b!.id);
        if (S.meta.curBook === b!.id) S.meta.curBook = S.books[0].id;
      }));
    });
  });
}
