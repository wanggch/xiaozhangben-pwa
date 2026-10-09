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

## M7 GitHub Pages 部署（2026-10-09，用户已同意）——已撤下
- 曾部署到 GitHub Pages 子路径；按用户要求已删除 Pages 站点、禁用工作流，子路径模式代码已移除

## 阶段三：账号体系 + 云同步 + 自托管部署（2026-10-09 起）
- [x] M8 后端：Node 22 + Fastify 5 + better-sqlite3（WAL + user_version 迁移）；邮箱密码账号（scrypt）、服务端可吊销会话（HttpOnly/Secure/SameSite=Lax）、登录限流 + 失败锁定、CSRF（Origin 校验）、zod 校验、请求体限制、安全头；增量同步 API（每用户单调 seq + 服务器时间戳 LWW + 软删除）；管理 CLI；26 个接口测试
- [x] M9 前端：登录页（独立入口，未登录只能看到它）、启动鉴权流程、IndexedDB 同步基线 + 增量推拉引擎（启动/联网/本地改动防抖/定时/手动；Web Locks 跨标签页互斥）、首次登录「上传本机数据 / 用云端数据覆盖」、「我的 › 账号与同步」页（状态、上次同步、立即同步、改密码、下线其他设备、退出、注销）、退出清空本机数据/缓存/SW；PIN 只存本机；E2E 22 个（含 9 个鉴权/同步用例）全部通过
- [ ] M10 部署包 deploy/（install.sh、systemd、Caddy、备份 timer、release.sh）+ Docker/compose，并在容器中实跑验证
- [ ] M11 CI 改为只跑测试、README 更新、推送

## 下一步
- 真机（iPhone Safari / Android Chrome）验收安装与全屏
