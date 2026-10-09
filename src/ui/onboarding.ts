/** 引导页（首次启动），最后一页可选择载入示例数据 */
import { S, save } from '../data/store';
import { refresh, toast, syncHistory } from './app';
import { $, $$ } from './dom';
import { ico } from './icons';
import { shade } from './pages/stats';
import { applySamples } from '../core/samples';
import { runRecurring } from '../core/recurring';
import { today } from '../core/dates';

const OB = () => [
  {
    t: '轻轻一记，<br/>心中有数', d: '大号数字键盘，支持加减运算。<br/>分类、账户、备注，三秒记完一笔。', art: `
    <div class="mock" style="left:0;right:24px;top:10px;animation-delay:.05s"><div class="eyebrow">本月支出</div><div class="num" style="font-size:38px;font-weight:600;letter-spacing:-.03em;margin:8px 0 14px"><span style="font-size:18px;color:var(--sub)">¥</span>3,932<span style="color:var(--mute)">.25</span></div><div class="track"><i style="width:66%"></i></div></div>
    <div class="mock mock-row" style="left:40px;right:0;top:170px;animation-delay:.18s"><span class="cat-ico sh0">${ico('coffee')}</span>咖啡<span class="amt num">-13.90</span></div>
    <div class="mock mock-row" style="left:16px;right:30px;top:246px;animation-delay:.3s"><span class="cat-ico sh2">${ico('traffic')}</span>地铁通勤<span class="amt num">-4.00</span></div>`,
  },
  {
    t: '看清每一笔<br/>去向', d: '周、月、年多维统计，分类排行一点即达。<br/>日历视图回看每一天。', art: `
    <div class="mock" style="left:10px;right:10px;top:0;display:flex;align-items:center;gap:22px;animation-delay:.05s"><svg viewBox="0 0 120 120" width="120" height="120" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="60" cy="60" r="46" fill="none" stroke="var(--fill)" stroke-width="12"/><circle cx="60" cy="60" r="46" fill="none" stroke="var(--accent)" stroke-width="12" stroke-dasharray="180 400"/><circle cx="60" cy="60" r="46" fill="none" style="stroke:rgba(var(--accent-rgb),.5)" stroke-width="12" stroke-dasharray="60 400" stroke-dashoffset="-184"/><circle cx="60" cy="60" r="46" fill="none" style="stroke:rgba(var(--accent-rgb),.25)" stroke-width="12" stroke-dasharray="40 400" stroke-dashoffset="-248"/></svg>
      <div style="flex:1;display:grid;gap:10px;font-size:12.5px">${[['住房', '62%'], ['餐饮', '21%'], ['交通', '14%']].map(([a, b], i) => `<div style="display:flex;align-items:center;gap:8px"><span style="width:7px;height:7px;border-radius:50%;background:${shade(i * 2)}"></span>${a}<span class="num" style="margin-left:auto;color:var(--sub)">${b}</span></div>`).join('')}</div></div>
    <div class="mock" style="left:30px;right:0;top:190px;animation-delay:.2s"><div style="display:flex;align-items:flex-end;gap:7px;height:90px">${[30, 55, 22, 70, 40, 88, 46, 60, 34, 76].map((h, i) => `<span style="flex:1;height:${h}%;border-radius:3px;background:${i === 5 ? 'var(--accent)' : 'rgba(var(--accent-rgb),.22)'}"></span>`).join('')}</div></div>`,
  },
  {
    t: '账户、预算<br/>与周期账单', d: '多账本、多账户与转账，预算超支及时提醒。<br/>可设应用锁，数据只存在你的设备上。', art: `
    ${([['bank', '招商银行', '38,420.00', 0], ['wechat', '微信钱包', '1,286.40', 1], ['card', '招行信用卡', '-2,316.80', 2]] as [string, string, string, number][]).map(([i, n, v, k]) => `<div class="mock mock-row" style="left:${k * 14}px;right:${28 - k * 14}px;top:${k * 76}px;animation-delay:${.05 + k * .12}s"><span class="cat-ico sh0">${ico(i)}</span>${n}<span class="amt num">¥${v}</span></div>`).join('')}
    <div class="mock" style="right:10px;top:236px;width:118px;display:flex;flex-direction:column;align-items:center;gap:8px;animation-delay:.45s"><span class="cat-ico sh4" style="width:40px;height:40px;border-radius:50%">${ico('lock')}</span><span style="font-size:12px;color:var(--sub)">应用锁</span></div>`,
  },
];
let obIdx = 0;
export const obOpen = () => !$('#ob').classList.contains('hide');
export function showOnboarding() {
  obIdx = 0; const ob = $('#ob'); const slides = OB();
  const canSample = !S.tx.length;
  ob.innerHTML = `<button class="ob-skip" data-ob="skip">跳过</button><div class="ob-track" id="obTrack">${slides.map((s, i) => `<div class="ob-slide ${i === 0 ? 'on' : ''}" aria-hidden="${i !== 0}"><div class="ob-art" aria-hidden="true">${s.art}</div><h2>${s.t}</h2><p>${s.d}</p>
      ${i === slides.length - 1 && canSample ? `<button class="ob-sample" data-ob="sample">${ico('sparkle')}载入示例数据体验一下<span>随时可在设置中一键清除</span></button>` : ''}</div>`).join('')}</div>
    <div class="ob-foot"><div class="ob-dots" aria-hidden="true">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div><button class="btn" data-ob="next">下一步</button></div>`;
  ob.classList.remove('hide'); ob.setAttribute('aria-hidden', 'false'); ob.setAttribute('role', 'dialog'); ob.setAttribute('aria-modal', 'true'); ob.setAttribute('aria-label', '欢迎使用小账本');
  ['#root', '#subs'].forEach(q => $(q).setAttribute('inert', ''));
  const track = $('#obTrack'); let sx: number | null = null, sy = 0, dx = 0, lock: 'x' | 'y' | null = null;
  track.onpointerdown = e => { if ((e.target as Element).closest('button')) return; sx = e.clientX; sy = e.clientY; dx = 0; lock = null; track.style.transition = 'none'; };
  track.onpointermove = e => {
    if (sx === null) return; const mx = e.clientX - sx, my = e.clientY - sy;
    if (!lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (lock === 'x') try { track.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } }
    if (lock !== 'x') return;
    dx = mx; if ((obIdx === 0 && dx > 0) || (obIdx === slides.length - 1 && dx < 0)) dx *= 0.35;
    track.style.transform = `translateX(calc(${-obIdx * 100}% + ${dx}px))`;
  };
  track.onpointerup = track.onpointercancel = () => { if (sx === null) return; sx = null; track.style.transition = ''; if (lock === 'x') { if (dx < -50) obGo(obIdx + 1); else if (dx > 50) obGo(obIdx - 1); else obGo(obIdx); } };
  ob.onclick = e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-ob]'); if (!b) return;
    const k = b.dataset.ob;
    if (k === 'skip') finishOb();
    else if (k === 'sample') { applySamples(S, today()); runRecurring(S, today()); finishOb(); refresh(); toast('已载入示例数据，可在设置中一键清除'); }
    else if (obIdx >= slides.length - 1) finishOb(); else obGo(obIdx + 1);
  };
}
function obGo(i: number) {
  const ob = $('#ob'); const n = $$('.ob-slide', ob).length;
  obIdx = Math.max(0, Math.min(n - 1, i));
  $('#obTrack').style.transform = `translateX(${-obIdx * 100}%)`;
  $$('.ob-slide', ob).forEach((s, k) => { s.classList.toggle('on', k === obIdx); s.setAttribute('aria-hidden', String(k !== obIdx)); });
  $$('.ob-dots i', ob).forEach((d, k) => d.classList.toggle('on', k === obIdx));
  $('[data-ob="next"]', ob).textContent = obIdx === n - 1 ? '开始使用' : '下一步';
  $('[data-ob="skip"]', ob).style.visibility = obIdx === n - 1 ? 'hidden' : '';
}
export function finishOb() {
  S.meta.onboarded = true; save();
  const ob = $('#ob'); ob.classList.add('hide'); ob.setAttribute('aria-hidden', 'true');
  ['#root', '#subs'].forEach(q => $(q).removeAttribute('inert'));
  syncHistory();
}
