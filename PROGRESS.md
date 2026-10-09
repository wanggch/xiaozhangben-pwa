# 小账本 PWA · 进度记录

原型：`/workspace/ledger-prototype/index.html`（只读，未修改）

## 技术选型
- Vite 8 + TypeScript 5.9（原生 TS，无 UI 框架，1:1 移植原型的模板字符串 + 事件委托写法）
- idb（IndexedDB 轻封装）、vite-plugin-pwa 2（Workbox generateSW，prompt 更新模式）
- 测试：Vitest（核心逻辑 + fake-indexeddb）+ Playwright（移动端 E2E，系统 Chrome）+ Lighthouse 13

## 里程碑
- [x] M1 工程脚手架 + 核心逻辑（金额分存储、键盘算式、周期规则、预算、示例数据、导入导出、PIN 哈希）+ 单元测试
- [x] M2 数据层（IndexedDB + 结构/数据版本迁移 + 增量写入 + 跨标签页同步）+ UI 内核（导航栈、系统返回键、弹层、Toast、撤销）
- [x] M3 全部页面与交互（对照原型逐页实现，截图并排对比）
- [x] M4 PWA（manifest、图标、SW 离线、新版本提示、安装引导、iOS 适配、快捷方式）+ Playwright E2E + IndexedDB 单测
- [x] M5 Lighthouse 优化与报告、截图（浅色/深色）与原型对比图
- [x] M6 README、部署配置（_headers / vercel.json）、release zip

## 当前状态（2026-10-09）
- `npm test`：7 个文件 34 个用例全部通过
- `npm run test:e2e`：13 个用例全部通过（`--repeat-each 2` 连跑 26 次无失败），无控制台错误
- Lighthouse（移动端模拟）：性能 100（手机常见字体集）/ 85（本沙箱 3700+ 字体，布局耗时来自系统字体匹配，原型同样如此）；无障碍 95；最佳实践 100；SEO 100
- 产物：`dist/`、`release/xiaozhangben-pwa-dist.zip`、`release/screenshots/`（含 `compare/` 原型对比）、`release/lighthouse/`

## 已知问题 / 后续
- 无障碍唯一扣分项：大数字的浅灰色「分」位（原型设计，对比度 1.8–2:1）；如需满分可加深 `--mute`
- 未做 iOS 启动图（apple-touch-startup-image），iOS 冷启动为背景色闪屏
- 4 位 PIN 只能防随手查看，数据未加密
- 需要真机（iPhone Safari / Android Chrome）验证安装、全屏、安全区与手势手感

## 下一步
- 真机验收后部署到 HTTPS 静态托管（需用户确认后再进行，当前未部署、未推送）
