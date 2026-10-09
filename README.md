# 小账本 · PWA

**线上地址：<https://wanggch.github.io/xiaozhangben-pwa/>**（GitHub Pages，推送到 `main` 后自动部署）

极简个人记账网页 App（PWA）。按已确认的原型（`/workspace/ledger-prototype/index.html`）1:1 实现，数据只保存在本机浏览器（IndexedDB），可离线使用，可「添加到主屏幕」全屏运行。

- 记一笔：支出 / 收入 / 转账，大号数字键盘支持 `+ −` 连算（按「=」后统一显示两位小数）
- 账单：按月浏览、类型筛选、左滑删除（可撤销）、详情 / 编辑 / 复制一笔、搜索（关键词 + 筛选 + 历史）、日历
- 统计：周 / 月 / 年，支出构成环形图、趋势柱状图、分类明细
- 预算（总预算 + 分类预算）、多账户与余额、多账本、分类管理（拖拽排序）、周期记账
- 设置：货币符号、每周第一天、浅色 / 深色 / 跟随系统、应用内记账提醒、应用锁（4 位 PIN，加盐哈希）、CSV / JSON 导入导出、清除示例数据、清空数据
- PWA：离线缓存、发现新版本提示刷新、可安装（Android Chrome / 桌面 Chrome / Edge）、iOS 添加到主屏幕全屏、主屏幕快捷方式「记一笔」

## 环境要求

- Node.js 20.19+ 或 22.12+（Vite 8 要求）
- npm 10+

## 本地运行

```bash
npm install
npm run dev          # 开发模式 http://localhost:5173 （开发模式下不启用 Service Worker）
```

手机上调试：`npm run dev -- --host`，手机与电脑连同一 Wi-Fi 后访问终端里显示的局域网地址。
注意 Service Worker / 安装只在 **HTTPS 或 localhost** 下生效，局域网 http 地址只能预览界面。

## 构建与预览

```bash
npm run build        # 类型检查 + 生成 dist/（含 manifest.webmanifest、sw.js）
npm run preview      # 本地预览生产版本 http://localhost:4173 （可测试离线与安装）
npm run release      # 把 dist/ 打包成 release/xiaozhangben-pwa-dist.zip
```

## 测试

```bash
npm test             # Vitest 单元测试：金额（分）、键盘算式、预算、周期规则、转账余额、导入导出、PIN、IndexedDB
npm run build && npm run test:e2e
                     # Playwright 移动端 E2E（390×844 触屏视口）：记账、返回键、导入导出、应用锁、离线打开并记账、可安装性
```

E2E 默认使用系统 Chrome（`/usr/bin/google-chrome`），也可用 `CHROME=/path/to/chrome npm run test:e2e` 指定，
或执行 `npx playwright install chromium` 使用 Playwright 自带浏览器。

其他脚本：`npm run icons` 重新生成图标（`scripts/gen-icons.mjs`）；`node scripts/screenshots.mjs`（需先 `npm run preview`）生成 `release/screenshots/` 下的截图与原型对比图。

## 部署

`dist/` 是纯静态文件，任何静态托管都可以。要求：

1. **必须 HTTPS**（Service Worker 与安装的前提，下面几家都默认提供）。
2. `sw.js` 与 `index.html` 不要被长时间强缓存（否则用户收不到新版本）；`assets/` 下带哈希的文件可以长期缓存。
3. App 只有一个页面，不需要服务端路由；如果部署在子路径（如 GitHub Pages 的 `/仓库名/`），构建时设置 `BASE`。

### Vercel

- 导入仓库 → Framework Preset 选 **Vite**（Build Command `npm run build`，Output Directory `dist`）即可；仓库根目录的 `vercel.json` 已配置缓存头。
- 或命令行：`npm i -g vercel && vercel --prod`。

### Netlify

- 新建站点 → Build command `npm run build`，Publish directory `dist`。
- 或把 `dist/` 文件夹直接拖到 Netlify 的 Deploys 页面（Netlify Drop）。
- 已内置 `public/_headers`（构建后位于 `dist/_headers`）：`sw.js` / `index.html` / manifest 不缓存，`assets/` 长期缓存。

### Cloudflare Pages

- Workers & Pages → 创建 → Pages → 连接 Git，Framework preset 选 **Vite**（构建命令 `npm run build`，输出目录 `dist`）。
- 或命令行：`npx wrangler pages deploy dist --project-name xiaozhangben`。
- 同样会读取 `dist/_headers`（与 Netlify 格式相同）。

### GitHub Pages（子路径，本仓库正在使用）

本仓库已配置 `.github/workflows/deploy.yml`：推送到 `main`（或在 Actions 页手动运行）时，先跑单元测试，再以子路径 `/xiaozhangben-pwa/` 构建并用官方 `actions/deploy-pages` 发布。
仓库 Settings → Pages → Source 需为 **GitHub Actions**（已设置）。

本地按线上同样的子路径构建与测试：

```bash
npm run build:pages            # = vite build --mode pages，base 为 /xiaozhangben-pwa/
npm run test:e2e:pages         # 在 http://localhost:4179/xiaozhangben-pwa/ 下跑 E2E
```

部署到其他仓库名的子路径：`BASE=/仓库名/ npm run build`（Windows PowerShell：`$env:BASE="/仓库名/"; npm run build`），
`BASE` 会同时作用于资源路径、manifest 的 `start_url` / `scope` / `id`、快捷方式和 Service Worker 作用域。
不设置时默认为 `/`（本地开发、Vercel / Netlify / Cloudflare Pages 都用这个）。

注意：GitHub Pages 不读取 `_headers`，HTML 默认缓存约 10 分钟，所以发布后最多约 10 分钟内 App 会出现「发现新版本」提示。

## 安装到手机

- **iPhone / iPad（Safari）**：分享按钮 → 「添加到主屏幕」。从主屏幕打开即全屏运行。
  - iOS 上主屏幕 App 与 Safari 的数据**相互独立**；如需迁移，在设置里导出 JSON 备份后再导入。
- **Android（Chrome）**：地址栏菜单 →「安装应用 / 添加到主屏幕」，或点首页的安装提示卡片。
- App 内「我的 → 添加到主屏幕」会根据当前浏览器显示对应步骤（微信内置浏览器会提示先用浏览器打开）。

## 数据与隐私

- 所有数据只保存在当前浏览器的 IndexedDB 中，不上传任何服务器；清除浏览器网站数据会删除账本，请定期在「设置 → 导出 JSON 备份」。
- 安装到主屏幕后会申请持久化存储（`navigator.storage.persist()`），降低被系统自动清理的概率。
- 金额以「分」为单位的整数存储，避免浮点误差。
- 应用锁：PIN 用 Web Crypto PBKDF2-SHA256（15 万次迭代、随机 16 字节盐）哈希后保存，不保存明文；连续输错 5 次起冷却（30 秒起逐次翻倍，最长 15 分钟）。应用锁用于防止他人随手查看，**数据本身没有加密**。忘记密码只能清空本机数据后重新开始。
- 导出的 JSON 备份不包含 PIN。

## 导入格式

- **JSON**：本 App 导出的备份（v3，金额为分）；也兼容原型导出的备份（v2，金额为元，会自动换算）。
- **CSV**：表头 `日期,类型,分类,金额,账户,转入账户,备注,账本,示例数据`（与原型导出一致，金额单位为元）。
  日期支持 `2026-10-09`、`2026/10/9`、`2026.10.9`、`2026年10月9日`；不存在的分类 / 账户会自动创建；按「账本」列匹配账本名称，找不到则导入当前账本。

## 关于提醒

网页 App 无法在 App 关闭时可靠地定时推送本地通知（iOS / Android 均没有可用于 PWA 的本地定时通知 API），
因此「每日记账提醒」是**应用内提醒**：打开 App 时若已过提醒时间且当天还没记账，会弹出提示；App 保持打开时到点也会提示。

## 目录结构

```
src/
  core/      纯逻辑（无 DOM）：金额、日期、键盘算式、账本计算、预算、周期规则、示例数据、CSV/JSON 导入导出、PIN 哈希
  data/      IndexedDB 结构与迁移（db.ts）、内存状态与增量持久化（store.ts）
  ui/        UI 内核（app.ts：导航栈 / 系统返回键 / 弹层 / Toast / 撤销）、手势、图表、记账面板、锁屏、引导
    pages/   四个一级页面：账单 / 统计 / 资产 / 我的
    subs/    二级页面：详情、搜索、日历、预算、账户、分类、周期、账本、设置、安装引导
  pwa/       Service Worker 注册与更新提示、安装引导
  styles/    proto.css（原型样式）+ app.css（真机适配：安全区、桌面居中容器等）
tests/unit   Vitest 单元测试
tests/e2e    Playwright E2E
scripts/     图标生成、截图对比、打包
```

## 数据结构版本

- IndexedDB 结构版本 `DB_VERSION`（新增 store / 索引时 +1，在 `src/data/db.ts` 的 `upgrade` 中按 `oldVersion` 迁移）。
- 数据格式版本 `DATA_VERSION`（字段含义变化时 +1，在 `DATA_MIGRATIONS` 中添加迁移函数，启动时自动按顺序执行）。
