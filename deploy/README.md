# 部署与运维

两种方式任选其一：

- **方式 A：系统服务（推荐）**：`release.sh` 在本地打包并通过 SSH 上传、远程执行 `install.sh`。Node 服务由 systemd 管理，Caddy 负责 HTTPS，每天自动备份。
- **方式 B：Docker Compose**：`docker compose up -d --build`，包含 app、Caddy 和备份三个容器。

两种方式都已在本地容器中实际跑过：Ubuntu 24.04（systemd + sshd 容器，`release.sh` 从本地上传安装，包括升级和重复执行）、Ubuntu 22.04（无 systemd 的 HTTP 模式）以及 Docker Compose（Caddy 自签证书），并用 `npm run test:smoke` 冒烟测试通过。

## 需要准备的东西

| 项目 | 要求 |
| --- | --- |
| 服务器 | Ubuntu 22.04 / 24.04 LTS 或 Debian 12 / 13，x86_64 或 arm64；1 核 CPU、512 MB 内存（推荐 1 GB）、1 GB 以上可用磁盘；能访问外网（安装时需要 apt、deb.nodesource.com、dl.cloudsmith.io、registry.npmjs.org） |
| 登录方式 | SSH 地址与端口；用户为 root，或者有 sudo 权限的用户；私钥路径（本地） |
| 域名 | 一个子域名，例如 `ledger.example.com` |
| DNS | 添加 **A 记录** `ledger` → 服务器公网 IPv4；有 IPv6 时再加 **AAAA 记录**，没有就不要加。如果用 Cloudflare，先设成「仅 DNS」（灰云），等证书签发成功后再决定是否开代理 |
| 端口 | 入站 **TCP 80**（证书验证与跳转 HTTPS）、**TCP 443**、**UDP 443**（HTTP/3，可选）、SSH 端口。云厂商的安全组和本机防火墙都要放行。Node 服务只监听 `127.0.0.1:8787`，**不要**对外开放 8787 |
| 国内服务器 | 域名需要已备案，否则 80/443 会被拦截 |
| 证书邮箱（可选） | 传给 `--acme-email`，用于接收证书到期提醒 |
| 第一个账号 | 你的登录邮箱（只用作登录名，不会发邮件）和密码（至少 8 位），安装后用 CLI 创建 |

不需要任何 API 密钥或其他机密：会话令牌在运行时随机生成，数据库只保存令牌的哈希。

## 已有 Nginx（不装 Caddy）

当服务器已经用 Nginx 占用 80/443 时：

```bash
bash deploy/release.sh --host … --domain pocket.example.com --key … \
  --port 49222 --app-port 8788 --no-caddy --write-nginx
# 然后单独给这个域名申请证书（不要动其他站点）：
ssh … "certbot --nginx -d pocket.example.com --non-interactive --agree-tos --redirect"
```

- `--app-port`：Node 只监听本机该端口（默认 8787；若已被占用请换）
- `--no-caddy`：不安装、不配置 Caddy，也不改防火墙
- `--write-nginx`：写入 `/etc/nginx/sites-available/<域名>`（HTTP 反代模板）并 reload；证书交给 certbot
- `--node-bin`：指定 node；默认优先 `/opt/xiaozhangben/node/bin/node`，再退回系统 PATH 中 ≥22.12 的 node。**不会**安装 NodeSource，也**不会**改/覆盖系统已有的 Node
- 安全头由应用设置；Nginx 模板不重复加 HSTS/CSP

## 方式 A：系统服务

### 首次上线

```bash
# 1) 在本机（仓库根目录）先确认 DNS 已生效：
dig +short ledger.example.com          # 应返回服务器 IP

# 2) 一键发布：本地构建 → 打包 → 上传 → 远程安装
bash deploy/release.sh --host 服务器IP --user root --key ~/.ssh/id_ed25519 \
  --domain ledger.example.com --acme-email you@example.com
#   非 root 用户加 --user ubuntu（远程会用 sudo）；SSH 端口不是 22 时加 --port 2222
#   先加 --dry-run 可以只打包并打印将执行的命令，不连接服务器

# 3) 创建第一个账号（在服务器上执行，会提示输入两次密码）
ssh -t root@服务器IP xiaozhangben-cli create-user you@example.com --admin

# 4) 打开 https://ledger.example.com 登录
```

`install.sh` 做的事情（可以重复执行，结果不变）：

1. 用 apt 安装 curl、gnupg、rsync、sqlite3 和编译工具（python3、make、g++，better-sqlite3 需要本地编译）。从 NodeSource 安装 **Node.js 22**（已有 22.12 及以上则跳过），从官方仓库安装 **Caddy**。
2. 创建系统用户 `xiaozhangben`（不能登录），并创建以下目录：
   - `/opt/xiaozhangben/releases/<版本>/`：程序，属主 root，服务只能读
   - `/opt/xiaozhangben/current`：软链接，指向当前版本
   - `/var/lib/xiaozhangben/`：数据库（750），其中 `backups/` 为 700
   - `/etc/xiaozhangben/env`：配置（640），只在不存在时生成，升级时只更新域名和端口
3. 安装依赖（`npm ci --omit=dev`）。如果已有数据库，先在线备份，再执行迁移，然后原子切换 `current`。
4. 安装 `xiaozhangben.service`（带沙箱加固：ProtectSystem=strict、NoNewPrivileges 等）、`xiaozhangben-backup.timer` 和 `/usr/local/bin/xiaozhangben-cli`。
5. 重启服务并做健康检查。**失败时自动回滚**到上一个版本。
6. 写入 `/etc/caddy/conf.d/xiaozhangben.caddy`，并确保 `/etc/caddy/Caddyfile` 里有 `import`（如果是 Caddy 自带的默认文件，会备份为 `.orig` 后替换）。然后校验配置并重载。ufw 已启用时会自动放行 80/443。
7. 只保留最近 5 个版本。

`install.sh` 的其他参数：

- `--tls internal`：使用 Caddy 自签证书，用于测试。
- `--tls off`：只用 HTTP，仅用于测试。
- `--no-caddy`：使用自己的 Nginx 反代。反代到 `127.0.0.1:8787`，并传 `X-Forwarded-Proto` 和 `X-Forwarded-For`。
- `--port`：Node 端口。
- `--skip-apt`：跳过 apt 安装。

### 升级

在本地拉取新代码后，再执行一次同样的 `release.sh` 命令即可。会先备份，然后迁移、切换、健康检查，失败时自动回滚。客户端在下次打开时会提示「发现新版本」。

### 日常运维

```bash
systemctl status xiaozhangben            # 服务状态
journalctl -u xiaozhangben -f            # 应用日志（JSON）
journalctl -u caddy -f                   # Caddy / 证书日志
systemctl list-timers xiaozhangben-backup.timer   # 下次备份时间（每天 03:30，服务器时区，随机延迟 20 分钟内）
sudo systemctl start xiaozhangben-backup  # 立即备份一次
sudoedit /etc/xiaozhangben/env && sudo systemctl restart xiaozhangben   # 改配置
```

**恢复备份**：

```bash
sudo systemctl stop xiaozhangben
sudo -u xiaozhangben cp /var/lib/xiaozhangben/backups/xiaozhangben-YYYYMMDD-HHMMSS.db /var/lib/xiaozhangben/xiaozhangben.db
sudo rm -f /var/lib/xiaozhangben/xiaozhangben.db-wal /var/lib/xiaozhangben/xiaozhangben.db-shm
sudo systemctl start xiaozhangben
```

建议另外定期把 `/var/lib/xiaozhangben/backups/` 拷贝到其他机器，例如在本地执行 `rsync -a root@服务器:/var/lib/xiaozhangben/backups/ ./xzb-backups/`。

## 管理命令（CLI）

服务器上用 `xiaozhangben-cli`，它以服务用户身份运行，并读取 `/etc/xiaozhangben/env`。Docker 里用 `docker compose exec app node dist/cli.js`，本地开发用 `npm run cli --`。

| 命令 | 作用 |
| --- | --- |
| `create-user <邮箱> [--admin]` | 创建账号，交互输入两次密码。脚本里可以用 `echo '密码' \| xiaozhangben-cli create-user 邮箱 --password-stdin` |
| `reset-password <邮箱>` | 重置密码（忘记密码时用；不发邮件），同时让该账号所有设备下线，并解除登录锁定 |
| `list-users` | 列出账号、记录数和在线会话数 |
| `revoke-sessions <邮箱>` | 让该账号所有设备下线，下次联网时会跳转到登录页 |
| `unlock <邮箱>` | 解除登录失败锁定（连续 5 次输错锁 15 分钟，之后每次翻倍，最长 24 小时） |
| `delete-user <邮箱> --yes` | 删除账号和它的全部云端数据 |
| `backup --dir <目录> [--keep-days 14]` | 在线备份（SQLite backup API，不停服务），并删除过期备份 |
| `migrate` | 只执行数据库迁移（服务启动时也会自动执行） |

开放自助注册：在 env 中设 `ALLOW_SIGNUP=true` 后重启服务（默认关闭，登录页不会显示注册入口）。

## 方式 B：Docker Compose

```bash
# 服务器上（需要 Docker Engine 和 compose 插件）：
git clone https://github.com/wanggch/xiaozhangben-pwa.git && cd xiaozhangben-pwa
echo 'DOMAIN=ledger.example.com' > .env
docker compose up -d --build
docker compose exec app node dist/cli.js create-user you@example.com --admin
```

- 数据保存在 `data` 卷中（`/data/xiaozhangben.db`）。`backup` 容器每 24 小时备份一次到 `/data/backups/`，保留 14 天。
- 证书保存在 `caddy_data` 卷中。
- 升级：`git pull && docker compose up -d --build`。
- 本地试用：`DOMAIN=localhost docker compose up -d --build`，然后打开 `https://localhost`。这时 Caddy 使用自签证书，浏览器需要点「继续访问」。

## 部署后冒烟测试（可选）

在本地执行。测试会登录、记一笔、在另一个浏览器上下文中确认已同步，然后删除这一笔（云端会留下一条删除记录）。

```bash
SMOKE_URL=https://ledger.example.com SMOKE_EMAIL=you@example.com SMOKE_PASSWORD='***' npm run test:smoke
```

## 常见问题

- **证书申请失败**：检查 DNS 是否已指向本机，安全组是否放行了 80/443，域名是否已备案（国内服务器），Cloudflare 是否设为灰云。用 `journalctl -u caddy` 查看具体原因。
- **登录提示「来源校验失败」**：浏览器地址必须和 `PUBLIC_ORIGIN` 完全一致，包括协议和端口。
- **HTTP 访问无法保持登录**：生产环境的 Cookie 带 `Secure`，必须用 HTTPS。
