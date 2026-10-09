// 按宣传视频里的品牌图标风格生成 PWA 图标：靛蓝渐变圆角方块 + 白色线性「账单」图标
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const glyph = (cx, cy, size) => {
  const s = size / 24, x = cx - size / 2, y = cy - size / 2;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></g>`;
};
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6D6DE3"/><stop offset="1" stop-color="#4F4FCB"/></linearGradient>
<radialGradient id="h" cx=".3" cy="0" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
// 普通图标：圆角方块，四周透明
const anySVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 512 512">${defs}<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/><rect x="16" y="16" width="480" height="480" rx="112" fill="url(#h)"/>${glyph(256, 256, 260)}</svg>`;
// 满版图标（maskable / apple-touch）：系统自行裁切圆角，图标落在 80% 安全区内
const fullSVG = (n, glyphSize = 230) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/>${glyph(256, 256, glyphSize)}</svg>`;

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(file, out).pathname);
await Promise.all([
  png(anySVG(512), 192, 'icon-192.png'),
  png(anySVG(512), 512, 'icon-512.png'),
  png(fullSVG(512, 200), 192, 'maskable-192.png'),
  png(fullSVG(512, 200), 512, 'maskable-512.png'),
  png(fullSVG(512, 250), 180, 'apple-touch-icon.png'),
  png(anySVG(512), 32, 'favicon-32.png'),
  png(fullSVG(512, 250), 1024, 'icon-1024.png'),
]);
writeFileSync(new URL('../public/favicon.svg', import.meta.url), anySVG(64));
writeFileSync(new URL('icon.svg', out), anySVG(512));
console.log('icons generated');
