// 打包 dist 为 release/xiaozhangben-pwa-dist.zip（先执行 npm run build）
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('未找到 dist/index.html，请先运行 npm run build'); process.exit(1); }
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(dist, p).split('\\').join('/')] = [readFileSync(p), { level: 9, mtime: statSync(p).mtime }];
  }
})(dist);
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', 'xiaozhangben-pwa-dist.zip');
writeFileSync(out, zipSync(files));
console.log(`已生成 ${relative(root, out)}（${Object.keys(files).length} 个文件，${(statSync(out).size / 1024).toFixed(1)} KB）`);
