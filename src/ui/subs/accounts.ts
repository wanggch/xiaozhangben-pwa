/** 账户详情 / 新增编辑账户 */
import { S, save } from '../../data/store';
import { SUB, money, empty, acctIco, groupList, pop, refresh, toast } from '../app';
import { $, $$, dataP, esc } from '../dom';
import { ico } from '../icons';
import { balance, flowOf, getAcct } from '../../core/ledger';
import { parseCents, sumAmt } from '../../core/money';
import { curYM } from '../../core/dates';
import { ACCT_TYPES } from '../../core/constants';
import { uid } from '../../core/id';
import { bindRows } from '../gestures';
import type { AcctType } from '../../core/types';

SUB.acct = ({ id }) => {
  const a = getAcct(S, id); if (!a) return { title: '账户', body: empty('wallet', '账户已删除') };
  const b = balance(S, id); const L = S.tx.filter(t => t.acct === id || t.toAcct === id);
  const mL = L.filter(t => t.date.startsWith(curYM()));
  const inM = sumAmt(mL.filter(t => (t.type === 'income' && t.acct === id) || (t.type === 'transfer' && t.toAcct === id)));
  const outM = sumAmt(mL.filter(t => (t.type === 'expense' && t.acct === id) || (t.type === 'transfer' && t.acct === id)));
  return {
    title: esc(a.name), right: `<button class="htxt" data-go="acctEdit" data-p="${dataP({ id: a.id })}">编辑</button>`, body: `
    <div class="dt-top" style="padding-bottom:18px">${acctIco(a)}<div class="n">${ACCT_TYPES[a.type].name}${a.sample ? ' · 示例数据' : ''}</div><div class="a num ${b < 0 ? 'neg' : ''}">${money(b)}</div>${a.type === 'credit' && b < 0 ? '<div class="eyebrow" style="margin-top:6px">当前欠款</div>' : ''}</div>
    <div class="group"><div class="mini" style="margin:0;border:0;padding:16px 0;grid-template-columns:repeat(2,1fr)"><div><b class="num">${money(inM)}</b><span>本月流入</span></div><div><b class="num">${money(outM)}</b><span>本月流出</span></div></div></div>
    <div class="quick-acts" style="margin-top:14px"><button class="qa" data-act="transfer" data-from="${esc(a.id)}">${ico('transfer')}转账</button><button class="qa" data-act="recWithAcct" data-acct="${esc(a.id)}">${ico('plus')}记一笔</button></div>
    <div class="group-t"><span>流水 · 全部账本</span><span>${L.length} 笔</span></div>
    ${L.length ? groupList(L) : empty('receipt', '这个账户还没有流水')}`,
    mount(el) { bindRows(el); },
  };
};

SUB.acctEdit = (p = {}) => {
  const a = p.id ? getAcct(S, p.id) : null; const type = a ? a.type : 'bank'; const bal = a ? balance(S, a.id) : 0;
  const balStr = a ? (type === 'credit' ? -bal : bal) / 100 : '';
  return {
    title: a ? '编辑账户' : '新增账户', right: `<button class="htxt" data-act="saveAcct" data-id="${a ? esc(a.id) : ''}">保存</button>`, body: `
    <div class="preview"><span class="cat-ico sh0" id="aPrevIco">${ico(ACCT_TYPES[type].icon)}</span><b id="aPrevName">${a ? esc(a.name) : '新账户'}</b></div>
    <div class="field"><label>账户类型</label><div class="chips" id="aType" role="radiogroup" aria-label="账户类型">${Object.entries(ACCT_TYPES).map(([k, v]) => `<button class="chip ${k === type ? 'on' : ''}" role="radio" aria-checked="${k === type}" data-t="${k}">${ico(v.icon)}${v.name}</button>`).join('')}</div></div>
    <div class="field"><label for="aName">账户名称</label><input class="input" id="aName" maxlength="16" placeholder="例如：招商银行、零钱" value="${a ? esc(a.name) : ''}"/></div>
    <div class="field"><label id="aBalLbl" for="aBal">${type === 'credit' ? '当前欠款' : '当前余额'}</label><input class="input big" id="aBal" type="text" inputmode="decimal" placeholder="0.00" value="${balStr}"/></div>
    <p class="hint" style="text-align:left;margin-top:10px">${a ? '修改余额会自动调整初始余额，不影响已有流水' : '之后的收支和转账会自动计入余额'}</p>
    ${a ? `<button class="btn line" style="color:var(--danger);margin-top:30px" data-act="delAcct" data-id="${esc(a.id)}">${ico('trash')}删除账户</button>` : ''}`,
    mount(el) {
      const nm = $<HTMLInputElement>('#aName', el);
      $('#aType', el).addEventListener('click', e => {
        const c = (e.target as Element).closest<HTMLElement>('.chip'); if (!c) return;
        $$('#aType .chip', el).forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-checked', String(x === c)); });
        const t = c.dataset.t as AcctType;
        $('#aPrevIco', el).innerHTML = ico(ACCT_TYPES[t].icon); $('#aBalLbl', el).textContent = t === 'credit' ? '当前欠款' : '当前余额';
        if (!nm.value.trim()) $('#aPrevName', el).textContent = ACCT_TYPES[t].name;
      });
      nm.addEventListener('input', () => $('#aPrevName', el).textContent = nm.value.trim() || '新账户');
      if (!a) setTimeout(() => nm.focus({ preventScroll: true }), 520);
    },
  };
};
export function saveAcct(el: HTMLElement, id?: string) {
  const name = $<HTMLInputElement>('#aName', el).value.trim(); const type = ($<HTMLElement>('#aType .chip.on', el).dataset.t || 'other') as AcctType;
  const raw = $<HTMLInputElement>('#aBal', el).value; let bal = parseCents(raw);
  if (!name) { $<HTMLInputElement>('#aName', el).focus(); toast('请填写账户名称', 'warn'); return; }
  if (S.accounts.some(x => x.name === name && x.id !== id)) { toast('已有同名账户', 'warn'); return; }
  if (type === 'credit') bal = -Math.abs(bal);
  if (id) {
    const a = getAcct(S, id)!; const flow = flowOf(S, id);
    Object.assign(a, { name, type, init: bal - flow }); delete a.sampleInit; delete a.sample;
  } else S.accounts.push({ id: 'a' + uid(), name, type, init: bal, order: Math.max(0, ...S.accounts.map(x => x.order + 1)) });
  save(); pop(); refresh(); toast(id ? '账户已更新' : `已添加账户「${esc(name)}」`);
}
