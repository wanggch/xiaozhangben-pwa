# 小账本 PWA · 进度记录

原型：`/workspace/ledger-prototype/index.html`（只读，不修改）

## 技术选型
- Vite + TypeScript（原生 TS，无 UI 框架）+ idb（IndexedDB 轻封装）+ vite-plugin-pwa（Workbox）
- 测试：Vitest（核心逻辑）+ Playwright（移动端 E2E，系统 Chrome）

## 里程碑
- [x] M1 工程脚手架 + 核心逻辑（金额分存储、键盘算式、周期规则、预算、示例数据、导入导出）+ 单元测试
- [x] M2 数据层（IndexedDB + 迁移）+ UI 框架（样式、导航栈、返回键、弹层、Toast）
- [~] M3 全部页面与交互（对照原型逐页实现）
- [ ] M4 PWA（manifest、图标、SW 离线、更新提示、安装引导、iOS 适配）
- [ ] M5 E2E + Lighthouse + 截图对比
- [ ] M6 README + release zip

## 下一步
见最新未勾选里程碑。
