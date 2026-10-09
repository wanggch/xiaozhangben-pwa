// 把多张截图拼成一张带标题的总览图
// 用法：node scripts/montage.mjs 输出.png 列数 "标题1=路径1" "标题2=路径2" ...
import sharp from 'sharp';
const [out, colsArg, ...items] = process.argv.slice(2);
const cols = Number(colsArg) || 4;
const W = 390, H = 844, PAD = 28, LABEL = 44, BG = '#EDEDEA';
const list = items.map(s => { const i = s.indexOf('='); return { label: s.slice(0, i), path: s.slice(i + 1) }; });
const rows = Math.ceil(list.length / cols);
const cw = W + PAD, ch = H + LABEL + PAD;
const width = cols * cw + PAD, height = rows * ch + PAD;
const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const comps = [];
for (const [i, it] of list.entries()) {
  const x = PAD + (i % cols) * cw, y = PAD + Math.floor(i / cols) * ch;
  const img = await sharp(it.path).resize(W, H).png().toBuffer();
  const mask = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="28" ry="28"/></svg>`);
  const rounded = await sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  comps.push({ input: rounded, left: x, top: y + LABEL });
  comps.push({ input: Buffer.from(`<svg width="${W}" height="${LABEL}"><text x="4" y="30" font-family="Noto Sans CJK SC, PingFang SC, sans-serif" font-size="20" font-weight="600" fill="#2A2A30">${esc(it.label)}</text></svg>`), left: x, top: y });
}
await sharp({ create: { width, height, channels: 4, background: BG } }).composite(comps).png().toFile(out);
console.log('已生成', out, `${width}x${height}`);
