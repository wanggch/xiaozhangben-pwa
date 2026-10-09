/** 空状态插画（内联 SVG，随主题变色；线条略带手绘感） */
const wrap = (body: string) => `<svg class="il" viewBox="0 0 160 120" aria-hidden="true">
  <path class="il-bg" d="M24 70c-6-26 14-50 44-54 22-3 34 6 52 4 18-2 30 14 26 34-4 22-14 40-44 46-26 5-38-6-56-6-14 0-19-8-22-24Z"/>
  <g class="il-sp"><path d="M136 22v8M132 26h8"/><path d="M22 34v6M19 37h6"/><circle cx="142" cy="78" r="2.2"/></g>${body}</svg>`;

const ILL: Record<string, string> = {
  receipt: wrap(`
  <path class="il-sh" d="M58 104h52"/>
  <path class="il-o" d="M54 22.5c0-2 1.5-3.5 3.6-3.5h45.2c2 0 3.7 1.6 3.7 3.6V96l-6.5-4.6-6.4 4.6-6.6-4.6-6.4 4.6-6.6-4.6-6.4 4.6L54 92Z"/>
  <path class="il-l" d="M64 36.5h24M64 47h31M64 57.5h18"/>
  <path class="il-l il-a2" d="M64 73h15M88 73h8"/>
  <circle class="il-coin" cx="108" cy="80" r="13"/><path class="il-coin-l" d="M103.5 76.5 108 81l4.5-4.5M108 81v6M104.5 83.5h7"/>`),
  pie: wrap(`
  <path class="il-sh" d="M50 106h60"/>
  <circle class="il-o" cx="80" cy="62" r="32"/>
  <path class="il-pa" d="M80 30a32 32 0 0 1 31.6 37.2L80 62Z"/>
  <path class="il-pb" d="M111.6 67.2A32 32 0 0 1 92 91.6L80 62Z"/>
  <path class="il-l" d="M80 62 59 86"/>
  <path class="il-l" d="M30 92c8-10 13-4 20-12"/>`),
  wallet: wrap(`
  <path class="il-sh" d="M48 104h64"/>
  <rect class="il-card2" x="56" y="26" width="52" height="34" rx="6" transform="rotate(-8 82 43)"/>
  <rect class="il-card1" x="50" y="34" width="54" height="34" rx="6" transform="rotate(6 77 51)"/>
  <path class="il-o" d="M42 52.5c0-3 2.4-5.5 5.5-5.5h64c3 0 5.5 2.5 5.5 5.5V93c0 3-2.5 5.5-5.5 5.5h-64A5.5 5.5 0 0 1 42 93Z"/>
  <path class="il-o" d="M96 66h21v17H96a8.5 8.5 0 0 1 0-17Z"/><circle class="il-dot" cx="98" cy="74.5" r="2.6"/>`),
  search: wrap(`
  <path class="il-sh" d="M46 106h56"/>
  <rect class="il-o" x="44" y="24" width="50" height="64" rx="8"/>
  <path class="il-l" d="M54 38h28M54 48h20M54 58h24"/>
  <circle class="il-o il-glass" cx="96" cy="70" r="17"/><path class="il-l" d="M90 70a6 6 0 0 1 6-6"/>
  <path class="il-handle" d="m108.5 82.5 12 12"/>`),
  repeat: wrap(`
  <path class="il-sh" d="M48 106h64"/>
  <rect class="il-o" x="46" y="28" width="68" height="64" rx="10"/>
  <path class="il-hd" d="M46 38a10 10 0 0 1 10-10h48a10 10 0 0 1 10 10v8H46Z"/>
  <path class="il-l" d="M62 22v12M98 22v12"/>
  <path class="il-arc" d="M68 72a13 13 0 1 0 4-12"/><path class="il-arc" d="m72 52 .5 8.5-8.5.5"/>`),
};
export const illus = (key: string): string | null => ILL[key] || null;
