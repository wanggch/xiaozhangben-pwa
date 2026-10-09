/** 分类管理（拖拽排序） / 新增编辑分类 */
import { S, save } from '../../data/store';
import { SUB, catIco, renderSub, pop, refresh, toast, segHTML } from '../app';
import { $, $$, dataP, esc } from '../dom';
import { ico } from '../icons';
import { PICK_ICONS, SYS_CATS } from '../../core/constants';
import { uid } from '../../core/id';
import { bindDragSort } from '../gestures';
import type { CatType } from '../../core/types';

SUB.cats = (p) => {
  p.type ||= 'expense'; const type = p.type as CatType; const list = S.cats[type];
  const used = (id: string) => S.tx.filter(t => t.cat === id).length;
  return {
    title: '分类管理', right: `<button class="hbtn" data-go="catEdit" data-p="${dataP({ type })}" aria-label="新增分类">${ico('plus')}</button>`, body: `
    <div style="display:flex;justify-content:center;margin:6px 0 4px">${segHTML('catType', [['expense', '支出分类'], ['income', '收入分类']], type, '', '分类类型')}</div>
    <div class="group" id="catList">${list.map((c, i) => `<div class="li" data-cid="${esc(c.id)}"><span class="grip" aria-hidden="true">${ico('grip')}</span>${catIco(c.id)}<button class="grow" style="text-align:left" data-go="catEdit" data-p="${dataP({ type, id: c.id })}">${esc(c.name)}<span class="sm">${used(c.id)} 笔记录${SYS_CATS.includes(c.id) ? ' · 默认分类' : ''}</span></button>
      <span class="ord"><button data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="上移${esc(c.name)}">${ico('up')}</button><button data-mv="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="下移${esc(c.name)}">${ico('down')}</button></span></div>`).join('')}
      <button class="li center" data-go="catEdit" data-p="${dataP({ type })}">${ico('plus')}新增${type === 'expense' ? '支出' : '收入'}分类</button></div>
    <div class="hint">拖动左侧把手或用箭头排序 · 顺序同步到记一笔</div>`,
    mount(el, pg) {
      $('.seg', el)?.addEventListener('segchange', e => { p.type = (e as CustomEvent).detail; renderSub(pg); });
      $$('[data-mv]', el).forEach(b => b.addEventListener('click', () => {
        const id = b.closest<HTMLElement>('.li')!.dataset.cid; const arr = S.cats[type]; const i = arr.findIndex(c => c.id === id), j = i + +b.dataset.mv!;
        if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; save(); renderSub(pg);
        requestAnimationFrame(() => $<HTMLButtonElement>(`.li[data-cid="${CSS.escape(id!)}"] [data-mv="${b.dataset.mv}"]`, pg.el)?.focus());
      }));
      bindDragSort($('#catList', el), ids => { S.cats[type].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); save(); renderSub(pg); toast('排序已保存'); });
    },
  };
};

SUB.catEdit = (p) => {
  const type = p.type as CatType;
  const c = p.id ? S.cats[type].find(x => x.id === p.id) : null; const icon = c ? c.icon : 'tag', sh = c ? (c.shade || 0) : 1;
  const SH: [string, string][] = [['sh0', '默认'], ['sh1', '浅'], ['sh2', '中'], ['sh3', '深'], ['sh4', '主色']];
  return {
    title: c ? '编辑分类' : `新增${type === 'expense' ? '支出' : '收入'}分类`, right: `<button class="htxt" data-act="saveCat">保存</button>`, body: `
    <div class="preview"><span class="cat-ico sh${sh}" id="cPrev">${ico(icon)}</span><b id="cPrevName">${c ? esc(c.name) : '新分类'}</b></div>
    <div class="field"><label for="cName">名称</label><input class="input" id="cName" maxlength="6" placeholder="最多 6 个字" value="${c ? esc(c.name) : ''}"/></div>
    <div class="field"><label>图标</label><div class="icon-grid" id="cIcons">${PICK_ICONS.map(k => `<button class="${k === icon ? 'on' : ''}" data-i="${k}" aria-label="图标 ${k}" aria-pressed="${k === icon}">${ico(k)}</button>`).join('')}</div></div>
    <div class="field"><label>颜色深浅</label><div class="shades" id="cShades">${SH.map(([k, n], i) => `<button class="${k} ${i === sh ? 'on' : ''}" data-s="${i}" title="${n}" aria-label="颜色 ${n}" aria-pressed="${i === sh}">${ico(icon)}</button>`).join('')}</div></div>
    ${c && !SYS_CATS.includes(c.id) ? `<button class="btn line" style="color:var(--danger);margin-top:30px" data-act="delCat" data-type="${type}" data-id="${esc(c.id)}">${ico('trash')}删除分类</button>` : c ? '<p class="hint">「其他」为默认分类，不可删除</p>' : ''}`,
    mount(el, pg) {
      const st = { icon, sh };
      const upd = () => {
        const pv = $('#cPrev', el); pv.className = `cat-ico sh${st.sh}`; pv.innerHTML = ico(st.icon);
        $$('#cShades button', el).forEach(b => { b.innerHTML = ico(st.icon); b.classList.toggle('on', +b.dataset.s! === st.sh); b.setAttribute('aria-pressed', String(+b.dataset.s! === st.sh)); });
      };
      $('#cIcons', el).addEventListener('click', e => { const b = (e.target as Element).closest<HTMLElement>('button'); if (!b) return; st.icon = b.dataset.i!; $$('#cIcons button', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); upd(); });
      $('#cShades', el).addEventListener('click', e => { const b = (e.target as Element).closest<HTMLElement>('button'); if (!b) return; st.sh = +b.dataset.s!; upd(); });
      $('#cName', el).addEventListener('input', e => $('#cPrevName', el).textContent = (e.target as HTMLInputElement).value.trim() || '新分类');
      pg.save = () => {
        const name = $<HTMLInputElement>('#cName', el).value.trim(); if (!name) { toast('请填写分类名称', 'warn'); $('#cName', el).focus(); return; }
        if (S.cats[type].some(x => x.name === name && x.id !== p.id)) { toast('已有同名分类', 'warn'); return; }
        if (c) Object.assign(c, { name, icon: st.icon, shade: st.sh }); else S.cats[type].push({ id: 'c' + uid(), name, icon: st.icon, shade: st.sh });
        save(); pop(); refresh(); toast(c ? '分类已更新' : `已新增分类「${esc(name)}」`);
      };
      if (!c) setTimeout(() => $('#cName', el).focus({ preventScroll: true }), 520);
    },
  };
};
