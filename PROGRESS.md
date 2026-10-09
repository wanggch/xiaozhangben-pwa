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
- [x] M10 部署包 deploy/：幂等 install.sh（Node 22 / Caddy / 系统用户 / 目录 / env / systemd 加固 / 每日备份 timer / CLI 包装 / 迁移前备份 / 健康检查失败自动回滚）、release.sh（本地打包 + rsync/scp + 远程安装，--dry-run）、package.sh；Dockerfile + docker-compose（app + Caddy + 备份）。实测：Ubuntu 24.04 systemd+sshd 容器中 release.sh 首装 / 升级 / 重复执行，Ubuntu 22.04 无 systemd HTTP 模式，Docker Compose（Caddy 自签证书），部署后冒烟 E2E 均通过
- [x] M11 deploy.yml 删除，改为只跑测试的 ci.yml；README 与 deploy/README.md 重写；推送 origin main

## 测试结果（2026-10-09）
- 前端单元 38/38、后端接口 26/26、E2E 22/22（含 9 个鉴权/同步）、部署冒烟 1/1（systemd 与 compose 两种部署各跑一次）

## 已知问题 / 限制（阶段三）
- 冲突按记录级「服务器到达时间」LWW，同一笔账在两台设备离线同时修改时后同步者覆盖
- 服务器上的删除墓碑永久保留（数据量极小）；分类排序变化会让同类型分类整体重传
- 会话在离线期间过期时，本机数据保留到下次联网启动才跳转登录
- 换另一个账号登录会清空本机数据（未同步的改动会丢失，退出时有提示）
- 登录限流计数在内存中（单进程足够；重启清零），失败锁定持久化在数据库
- better-sqlite3 需在服务器本地编译（install.sh 已自动安装编译工具）
- 前端代码在公开仓库中本来就可见，受保护的是数据与接口

## 下一步
- 拿到服务器信息后按 deploy/README.md 上线
- 真机（iPhone Safari / Android Chrome）验收安装、登录与同步

## M12 生产部署适配（Nginx 共存 / 现有 Node）
- install.sh：`--node-bin`、私有 Node 回退、`--write-nginx`、`--no-caddy`；systemd/CLI 使用实际 NODE_BIN，不覆盖系统 Node、不改防火墙
- release.sh：`--app-port` / `--no-caddy` / `--write-nginx` / `--node-bin` / `--skip-apt`
- `deploy/nginx-site.conf.example`：反代模板（证书交给 certbot）

## 阶段五：用户反馈修复 + 视觉改版 v2（2026-10-09，未部署，等待用户看截图确认）
- [x] M13 记一笔默认「不选择账户」：新增设置「记账默认账户」（默认不选，随 settings 同步；删除账户/修复数据时回退为不选）；不再记住上次账户；周期账单新建同样默认；无账户账单不影响任何余额与净资产；转账仍必须选两个账户。单测 + E2E
- [x] M14 登录页重做：品牌标识 + 标语、渐变光晕与点阵底纹、半透明卡片、带图标输入框（聚焦/错误态）、显示/隐藏密码、按钮加载态、错误提示与抖动、入场动画、「数据加密传输 · 离线可用」页脚；深色模式单独调色；保留全部元素 id
- [x] M15 App 视觉系统 v2（src/styles/v2.css）：设计令牌（圆角/阴影层级/间距/字号/色板）；分类与账户 9 色柔和配色（按图标自动，分类编辑可选颜色，Category.tone 可选字段，兼容旧数据）；首页渐变总览卡（支出/收支/预算进度）；资产墨色卡；金额排版；手绘风 SVG 空状态；Tab 栏指示条 + 渐变记一笔按钮；记一笔彩色分类与键盘；统计环形图用分类色、柱状图渐变；我的/账号页头部；列表按压反馈；遵守减少动态效果
- 截图（不入库）：release/screenshots/v1-before/（改版前）、release/screenshots/v2/（改版后，含 overview.png、login-compare.png、home-compare.png）；生成脚本 scripts/shots.mjs、scripts/montage.mjs（本地临时库 + 示例数据，不使用真实账号）
- Lighthouse（本沙箱，移动端模拟，同环境改版前/后各 4 次）：App 性能中位数 82 → 82，无障碍 95 → 95（扣分项均为引导页装饰数字与 Toast 动画中间态，改版前后相同），最佳实践 100；登录页 性能 100 / 无障碍 100 / 最佳实践 100（SEO 仅因登录页 noindex 扣分，有意为之）
- 测试：前端单元 45/45、后端接口 26/26、E2E 23/23
