# 小账本 · PWA

极简个人记账网页 App（PWA）+ 自托管同步服务。前端按已确认的原型 1:1 实现，数据以本机 IndexedDB 为主（离线优先），登录后与自己服务器上的 Node + SQLite 后端增量同步，多设备共用一个账本。

> 本仓库公开，但**不包含任何线上地址或密钥**。之前的 GitHub Pages 公开站点已下线；现在需要自己部署后端，未登录用户只能看到登录页。

- 记一笔：支出 / 收入 / 转账，大号数字键盘支持 `+ −` 连算（按「=」后统一显示两位小数）
- 账单：按月浏览、类型筛选、左滑删除（可撤销）、详情 / 编辑 / 复制一笔、搜索（关键词 + 筛选 + 历史）、日历
- 统计：周 / 月 / 年，支出构成环形图、趋势柱状图、分类明细
- 预算（总预算 + 分类预算）、多账户与余额、多账本、分类管理（拖拽排序）、周期记账
- 设置：货币符号、每周第一天、浅色 / 深色 / 跟随系统、应用内记账提醒、应用锁（4 位 PIN，加盐哈希，只存本机）、CSV / JSON 导入导出
- 账号与同步：邮箱 + 密码登录（默认不开放注册，管理员用 CLI 建号）、多设备增量同步、离线记账联网后自动上传、「我的 › 账号与同步」查看状态并手动同步、修改密码、下线其他设备、退出（清空本机数据）、注销账号（删除云端数据）
- PWA：离线缓存、新版本提示、可安装（Android / 桌面 Chrome / Edge）、iOS 添加到主屏幕全屏

## 架构

```
浏览器（PWA）                                 服务器
┌──────────────────────────┐   HTTPS   ┌───────────┐  127.0.0.1:8787  ┌──────────────────────────────┐
│ UI ─ IndexedDB（主存储）  │ ────────► │   Caddy   │ ───────────────► │ Node 22 · Fastify 5           │
│      └ 同步引擎 push/pull │ ◄──────── │ 自动证书   │                  │  /api/auth/*  /api/sync/*     │
│ Service Worker（离线）    │           └───────────┘                  │  静态文件（登录后才可访问）     │
└──────────────────────────┘                                          │  better-sqlite3（WAL）         │
                                                                      └──────────────────────────────┘
```

**选型理由**

- **Fastify**（而不是 Hono）：Node 上最成熟的框架之一，有官方的 cookie、静态文件插件；可以按路由限制请求体（同步接口 8 MB，其余 64 KB）；`inject()` 不用开端口就能做接口测试；日志（pino）开箱即用。Hono 的优势是跨运行时（Workers、Bun），这里只跑在 Node 上，用不上。
- **better-sqlite3**（而不是 node:sqlite）：稳定、同步 API（单进程下事务简单可靠）、自带在线备份 API。node:sqlite 在 Node 22 中仍是实验特性（会打印警告）。代价是安装时需要编译工具，`install.sh` 会自动装好。
- **scrypt**（node:crypto，N=2^17, r=8, p=1）：满足 OWASP 推荐强度，不需要再引入原生依赖（argon2 需要额外编译）。
- **服务端会话**（而不是 JWT）：HttpOnly + Secure + SameSite=Lax 的 `__Host-` Cookie，数据库只保存令牌的 SHA-256。可以随时吊销（退出、改密码、CLI），滑动 30 天，最长 180 天。
- **Caddy**：自动申请和续期证书，配置只有几行；Node 只监听本机。

**同步设计**

- 所有实体（账单、账户、账本、周期规则、分类、设置）都是一条记录：`(用户, 类型, id) → JSON`，服务器记录 `updatedAt`（服务器时间，单调递增）、`seq`（每用户单调递增序号）和软删除标记 `deleted`。
- **推送**：客户端在 IndexedDB 中保存每条记录「上次同步时的内容」（同步基线），与当前内容不同的就是待上传的改动，删除会变成墓碑。每批最多 400 条。
- **拉取**：按 `seq` 增量拉取（`since=游标`），本地还有未上传改动的记录会跳过（随后由推送覆盖）。
- **冲突**：记录级「后到服务器者胜」（LWW，按服务器时间）。
- **触发时机**：启动、恢复联网、本地改动后 1.5 秒防抖、页面可见时每 60 秒、切回前台、手动「立即同步」。多个标签页通过 Web Locks 互斥。
- **首次在某台设备登录**：如果本机已有数据，且云端也有数据，会询问「上传本机数据 / 用云端数据覆盖」。
- **应用锁 PIN 只存本机，永不上传**。退出登录会清空本机账本、缓存和 Service Worker。

**安全**

- 未登录时 App 页面和接口都不可访问（HTML 跳转登录页，其他返回 401）。
- CSRF：SameSite=Lax 加 Origin 校验，只接受 JSON。
- 所有输入都用 zod 校验，并限制请求体大小。
- 登录限流：每 IP 10 分钟 20 次。失败锁定：按邮箱计，5 次后锁 15 分钟，之后每次翻倍。对不存在的邮箱同样计数、同样耗时，防止枚举账号。
- 安全头：CSP（内联脚本用 hash 放行）、HSTS、frame-ancestors none、nosniff、no-referrer 等。
- 每个用户的数据都按 user_id 隔离，有测试证明。

## 环境要求

- Node.js 22.12+、npm 10+
- 编译工具（better-sqlite3）：Linux `build-essential python3`；macOS Xcode Command Line Tools

## 本地开发

```bash
npm install && npm --prefix server install

# 方式 1：前后端分开（前端热更新）
npm run dev:server            # 后端 http://127.0.0.1:8787，数据库 ./data/xiaozhangben.db
npm run dev                   # 前端 http://localhost:5173，/api 代理到后端
npm run cli -- create-user me@example.com      # 另开终端创建账号（交互输入密码）

# 方式 2：和生产一致（后端同时提供构建好的前端）
npm run start                 # 构建前后端后打开 http://localhost:8787
```

后端配置全部来自环境变量，见 [.env.example](.env.example)。**仓库里没有、也不需要任何密钥。**
开发模式下不启用 Service Worker。手机调试需要 HTTPS（或用电脑的 localhost），因为生产 Cookie 带 Secure。

## 测试

```bash
npm test                      # 前端单元测试（Vitest）：金额、算式、预算、周期、导入导出、PIN、IndexedDB、同步记录映射
npm run test:server           # 后端接口测试：注册关闭、登录、Cookie 属性、限流与锁定、会话吊销、CSRF、请求体限制、
                              #   访问控制、安全头、跨用户隔离、增量同步、冲突、软删除、注销账号
npm run build && npm --prefix server run build && npm run test:e2e
                              # Playwright 移动端 E2E：自动启动真实后端 + 临时 SQLite（端口 4179）
```

E2E 默认使用系统 Chrome（`/usr/bin/google-chrome`），也可以用 `CHROME=/path/to/chrome` 指定，或者执行 `npx playwright install chromium`。
CI（`.github/workflows/ci.yml`）只跑上述测试，**不做任何部署**。

## 部署

见 **[deploy/README.md](deploy/README.md)**：其中包括需要准备的信息（系统、端口、DNS）、一键发布 `deploy/release.sh`、服务器安装脚本 `deploy/install.sh`（systemd + Caddy + 每日备份）、Docker Compose，以及 CLI 用法。

```bash
bash deploy/release.sh --host 服务器IP --user root --key ~/.ssh/id_ed25519 --domain ledger.example.com
```

## 安装到手机

- **iPhone / iPad（Safari）**：分享按钮 → 「添加到主屏幕」。从主屏幕打开即全屏运行。
  - iOS 上主屏幕 App 与 Safari 的存储**相互独立**，需要在主屏幕 App 里再登录一次（数据会从云端同步过来）。
- **Android（Chrome）**：地址栏菜单 →「安装应用 / 添加到主屏幕」，或点首页的安装提示卡片。
- App 内「我的 → 添加到主屏幕」会根据当前浏览器显示对应步骤（微信内置浏览器会提示先用浏览器打开）。

## 数据与隐私

- 账本主存储在浏览器 IndexedDB 中（离线可用），登录后同步到**你自己的服务器**（SQLite，每天自动备份，保留 14 天）。服务器上的数据没有端到端加密，由服务器管理员负责保管。
- 退出登录会清空本机账本和缓存；有未同步的改动时会先提示。忘记应用锁 PIN 时，可以退出登录，再重新登录从云端恢复。
- 安装到主屏幕后会申请持久化存储（`navigator.storage.persist()`），降低被系统自动清理的概率。
- 金额以「分」为单位的整数存储，避免浮点误差。
- 应用锁：PIN 用 Web Crypto PBKDF2-SHA256（15 万次迭代、随机 16 字节盐）哈希后保存，不保存明文；连续输错 5 次起冷却（30 秒起逐次翻倍，最长 15 分钟）。应用锁用于防止他人随手查看，**本机数据本身没有加密**；PIN 不会同步到服务器。
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
server/      后端（Fastify + better-sqlite3）：src/app.ts 路由、accounts.ts 账号与会话、sync.ts 同步、db.ts 迁移、cli.ts 管理命令；test/ 接口测试
deploy/      install.sh、release.sh、package.sh、systemd 单元、Caddyfile、CLI 包装、部署文档
login.html   登录页入口（src/login/），未登录时唯一可访问的页面
src/
  sync/      同步：api.ts 请求封装、records.ts 状态⇄记录映射、engine.ts 推拉引擎、session.ts 登录态 / 退出 / 改密码
  core/      纯逻辑（无 DOM）：金额、日期、键盘算式、账本计算、预算、周期规则、示例数据、CSV/JSON 导入导出、PIN 哈希
  data/      IndexedDB 结构与迁移（db.ts）、内存状态与增量持久化（store.ts）
  ui/        UI 内核（app.ts：导航栈 / 系统返回键 / 弹层 / Toast / 撤销）、手势、图表、记账面板、锁屏、引导
    pages/   四个一级页面：账单 / 统计 / 资产 / 我的
    subs/    二级页面：详情、搜索、日历、预算、账户、分类、周期、账本、设置、安装引导
  pwa/       Service Worker 注册与更新提示、安装引导
  styles/    proto.css（原型样式）+ app.css（真机适配：安全区、桌面居中容器等）
tests/unit   Vitest 单元测试
tests/e2e    Playwright E2E（app.spec.ts 记账功能，auth.spec.ts 登录 / 同步 / 退出）
tests/smoke  部署后冒烟测试（npm run test:smoke）
scripts/     图标生成、截图对比
```

## 数据结构版本

- IndexedDB 结构版本 `DB_VERSION`（新增 store / 索引时 +1，在 `src/data/db.ts` 的 `upgrade` 中按 `oldVersion` 迁移）。
- 服务端数据库版本：`server/src/db.ts` 的 `MIGRATIONS` 数组（SQLite `user_version`），启动和 `migrate` 命令时自动执行。
- 数据格式版本 `DATA_VERSION`（字段含义变化时 +1，在 `DATA_MIGRATIONS` 中添加迁移函数，启动时自动按顺序执行）。
