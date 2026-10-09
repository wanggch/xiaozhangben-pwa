import { short } from '../core/money';
import { niceMax } from '../core/stats';
import { $, $$ } from './dom';

/** 柱状图（SVG），values 单位为分 */
export function barSVG(values: number[], labels: string[], opts: { h?: number; hi?: (i: number) => boolean; label?: string } = {}) {
  const n = values.length, max = Math.max(...values, 0), nice = niceMax(Math.max(max, 100));
  const W = 300, H = opts.h || 128, left = 28, bw = (W - left) / n;
  const bars = values.map((v, i) => {
    const h = v / nice * H; const hi = opts.hi ? opts.hi(i) : v === max;
    return v > 0 ? `<rect class="b" data-i="${i}" x="${(left + i * bw + bw * .2).toFixed(2)}" y="${(H - Math.max(h, 2)).toFixed(2)}" width="${(bw * .6).toFixed(2)}" height="${Math.max(h, 2).toFixed(2)}" rx="${Math.min(3, bw * .3).toFixed(2)}" style="fill:${hi ? 'url(#barHi)' : 'rgba(var(--accent-rgb),.2)'};animation-delay:${i * (n > 12 ? 16 : 40)}ms"></rect>` : '';
  }).join('');
  const grid = [0, .5, 1].map(f => `<line x1="${left}" x2="${W}" y1="${H - f * H}" y2="${H - f * H}" stroke-dasharray="${f ? '2 4' : ''}"></line><text x="0" y="${H - f * H + 3}">${short(nice * f)}</text>`).join('');
  const idx = n > 12 ? [0, 9, 19, n - 1] : [...Array(n).keys()];
  const xl = idx.map(i => `<text x="${left + (i + .5) * bw}" y="${H + 16}" text-anchor="middle">${labels[i]}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="${opts.label || '柱状图'}"><defs><linearGradient id="barHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent-2)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient></defs>${grid}${bars}${xl}</svg><div class="tip num" aria-live="polite"></div>`;
}

export function bindBars(card: HTMLElement | null, values: number[], tipText: (i: number, v: number) => string) {
  if (!card) return; const tip = $('.tip', card); if (!tip) return;
  $$<SVGRectElement>('rect.b', card).forEach(r => {
    const show = () => {
      const i = +r.dataset.i!; const rb = r.getBoundingClientRect(), cb = card.getBoundingClientRect();
      tip.textContent = tipText(i, values[i]);
      const x = Math.max(50, Math.min(cb.width - 50, rb.left + rb.width / 2 - cb.left));
      tip.style.left = x + 'px'; tip.style.top = (rb.top - cb.top) - 4 + 'px'; tip.classList.add('show');
    };
    r.addEventListener('pointerenter', show); r.addEventListener('click', show); r.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tip.classList.remove('show'); });
  });
  card.addEventListener('pointerdown', e => { if (!(e.target as Element).closest('rect.b')) tip.classList.remove('show'); });
}
