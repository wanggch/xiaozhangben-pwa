/** 触控手势：账单左滑删除、拖拽排序、二级页左缘滑动返回 */
import { $, $$, vibrate } from './dom';
import { pop, push, setCloseRowHook, stack } from './app';

/* ---------- 左滑删除 ---------- */
let openRow: HTMLElement | null = null;
export function closeRow(r: HTMLElement | null = openRow) {
  if (!r) return; r.classList.remove('open'); const m = $<HTMLElement>('.tx-main', r); if (m) m.style.transform = ''; if (openRow === r) openRow = null;
}
setCloseRowHook(() => closeRow());
let removeHook: (id: string, row: HTMLElement) => void = () => { /* 注入 */ };
export const setRemoveHook = (f: typeof removeHook) => { removeHook = f; };

export function bindRows(root: ParentNode) { $$<HTMLElement>('.tx', root).forEach(bindSwipe); }
function bindSwipe(row: HTMLElement & { _swiped?: boolean }) {
  const m = $<HTMLElement>('.tx-main', row);
  let sx = 0, sy = 0, dx = 0, base = 0, down = false, lock: 'x' | 'y' | null = null, pid = -1, buzzed = false;
  m.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (openRow && openRow !== row) closeRow(openRow);
    down = true; lock = null; sx = e.clientX; sy = e.clientY; pid = e.pointerId; base = row.classList.contains('open') ? -84 : 0; dx = base; buzzed = false;
  });
  m.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== pid) return; const mx = e.clientX - sx, my = e.clientY - sy;
    if (lock === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      lock = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y';
      if (lock === 'x') { try { m.setPointerCapture(e.pointerId); } catch { /* 已释放 */ } m.style.transition = 'none'; }
      else down = false;
    }
    if (lock === 'x') {
      // 超过 84px 后增加阻尼，接近删除阈值时轻震提示
      const raw = base + mx; dx = Math.max(-260, Math.min(0, raw > -84 ? raw : -84 + (raw + 84) * 0.75));
      m.style.transform = `translateX(${dx}px)`;
      if (dx < -190 && !buzzed) { buzzed = true; vibrate(10); } else if (dx > -190) buzzed = false;
    }
  });
  const end = () => {
    if (!down && lock !== 'x') return; down = false; m.style.transition = '';
    if (lock === 'x') {
      if (dx < -190) removeHook(row.dataset.id!, row);
      else if (dx < -40) { row.classList.add('open'); m.style.transform = 'translateX(-84px)'; openRow = row; }
      else closeRow(row);
      row._swiped = true; setTimeout(() => row._swiped = false, 60);
    }
    lock = null;
  };
  m.addEventListener('pointerup', end); m.addEventListener('pointercancel', end);
  const open = () => { if (row._swiped) return; if (row.classList.contains('open')) return closeRow(row); push('detail', { id: row.dataset.id }); };
  m.addEventListener('click', open);
  m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } else if (e.key === 'Delete' || e.key === 'Backspace') removeHook(row.dataset.id!, row); });
}

/* ---------- 拖拽排序（把手） ---------- */
export function bindDragSort(listEl: HTMLElement, onDone: (ids: string[]) => void) {
  $$<HTMLElement>('.grip', listEl).forEach(g => g.addEventListener('pointerdown', e => {
    e.preventDefault();
    const row = g.closest<HTMLElement>('.li')!; const rows = $$<HTMLElement>('.li[data-cid]', listEl); const h = row.offsetHeight; const start = e.clientY; const idx = rows.indexOf(row); let target = idx;
    try { g.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    row.classList.add('dragging'); rows.forEach(r => r !== row && r.classList.add('drag-anim')); vibrate(8);
    const scroller = listEl.closest<HTMLElement>('.sub-b');
    let lastY = e.clientY, raf = 0;
    const layout = () => {
      const dy = lastY - start + (scroller ? scroller.scrollTop - st0 : 0); row.style.transform = `translateY(${dy}px)`;
      const nt = Math.max(0, Math.min(rows.length - 1, idx + Math.round(dy / h)));
      if (nt !== target) { target = nt; vibrate(5); }
      rows.forEach((r, i) => { if (r === row) return; let s = 0; if (i > idx && i <= target) s = -h; if (i < idx && i >= target) s = h; r.style.transform = s ? `translateY(${s}px)` : ''; });
    };
    const st0 = scroller ? scroller.scrollTop : 0;
    // 拖到边缘时自动滚动
    const autoScroll = () => {
      if (!scroller) return; const r = scroller.getBoundingClientRect();
      const v = lastY < r.top + 60 ? -6 : lastY > r.bottom - 60 ? 6 : 0;
      if (v) { scroller.scrollTop += v; layout(); }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    const move = (ev: PointerEvent) => { lastY = ev.clientY; layout(); };
    const up = () => {
      cancelAnimationFrame(raf);
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
      rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging', 'drag-anim'); });
      if (target !== idx) { const ids = rows.map(r => r.dataset.cid!); ids.splice(target, 0, ids.splice(idx, 1)[0]); onDone(ids); }
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  }));
}

/* ---------- 二级页左缘滑动返回（iOS 主屏幕模式下没有浏览器手势，自己实现） ---------- */
export function initEdgeBack() {
  const subs = $('#subs'); const app = $('#app');
  let sx = 0, sy = 0, t0 = 0, active = false, decided = false, el: HTMLElement | null = null, below: HTMLElement | null = null, w = 0, dx = 0, pid = -1;
  subs.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !stack.length) return;
    const rect = app.getBoundingClientRect();
    if (e.clientX - rect.left > 24) return;
    const pg = stack[stack.length - 1]; el = pg.el; below = stack.length > 1 ? stack[stack.length - 2].el : $<HTMLElement>('#root');
    sx = e.clientX; sy = e.clientY; t0 = performance.now(); active = true; decided = false; w = rect.width; dx = 0; pid = e.pointerId;
  }, true);
  subs.addEventListener('pointermove', e => {
    if (!active || e.pointerId !== pid || !el || !below) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { active = false; return; }
      decided = true; el.classList.add('dragging'); below.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    }
    dx = Math.max(0, mx); const p = dx / w;
    el.style.transform = `translateX(${dx}px)`;
    below.style.transform = `translateX(${-22 * (1 - p)}%)`; below.style.opacity = String(.4 + .6 * p);
  }, true);
  const end = () => {
    if (!active) return; active = false; if (!decided || !el || !below) return;
    const v = dx / Math.max(1, performance.now() - t0);
    el.classList.remove('dragging'); below.classList.remove('dragging');
    if (dx > w * 0.33 || v > 0.6) { pop(); }
    else { el.style.transform = ''; below.style.transform = ''; below.style.opacity = ''; }
    el = below = null;
  };
  subs.addEventListener('pointerup', end, true); subs.addEventListener('pointercancel', end, true);
}
