#!/usr/bin/env bash
# 小账本 · 服务器安装/升级脚本（幂等，可重复执行）
# 适用：Ubuntu 22.04 / 24.04、Debian 12 / 13（x86_64 或 arm64），需 root 或 sudo。
# 在「解压后的部署包」目录中运行（release.sh 会自动上传并执行）：
#   sudo bash deploy/install.sh --domain ledger.example.com [--acme-email you@example.com]
# 选项：
#   --domain D        站点域名（首次安装必填；之后会记住，可省略）
#   --acme-email E    证书账户邮箱（可选，用于证书到期提醒）
#   --tls MODE        auto（默认，公网证书）| internal（Caddy 自签，测试用）| off（仅 HTTP，测试用）
#   --port P          Node 监听端口（仅本机 127.0.0.1，默认 8787）
#   --no-caddy        不安装/配置 Caddy（自己用 Nginx 等反代时）
#   --skip-apt        跳过 apt 安装（已手动装好 Node 22 / Caddy 时）
# 目录：程序 /opt/xiaozhangben/releases/<版本>（current 软链接指向当前版本），
#       数据 /var/lib/xiaozhangben（数据库与 backups/），配置 /etc/xiaozhangben/env
set -Eeuo pipefail

APP=xiaozhangben
APP_USER=xiaozhangben
OPT=/opt/$APP
DATA=/var/lib/$APP
ETC=/etc/$APP
ENV_FILE=$ETC/env
KEEP_RELEASES=5

DOMAIN=""; ACME_EMAIL=""; TLS=auto; PORT=""; NO_CADDY=0; SKIP_APT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --acme-email) ACME_EMAIL="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-caddy) NO_CADDY=1; shift ;;
    --skip-apt) SKIP_APT=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m警告：\033[0m%s\n' "$*" >&2; }
die()  { printf '\033[1;31m错误：\033[0m%s\n' "$*" >&2; exit 1; }
trap 'die "第 $LINENO 行执行失败：$BASH_COMMAND"' ERR

[[ $EUID -eq 0 ]] || die "请用 root 或 sudo 运行"
[[ $TLS =~ ^(auto|internal|off)$ ]] || die "--tls 只能是 auto / internal / off"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f $SRC/VERSION && -f $SRC/server/dist/index.js && -f $SRC/dist/index.html ]] || die "请在部署包目录中运行（缺少 VERSION / server/dist / dist）"
REL="$(tr -cd 'A-Za-z0-9._-' < "$SRC/VERSION")"
HAS_SYSTEMD=0; [[ -d /run/systemd/system ]] && HAS_SYSTEMD=1

# ---- 0. 系统检查 ----
OS="$(. /etc/os-release && echo "${ID}:${VERSION_ID:-}")"
case "$OS" in
  ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) ;;
  *) warn "未验证的系统 $OS，按 Debian 系继续" ;;
esac
command -v apt-get >/dev/null || die "需要 apt（Ubuntu / Debian）"

# 读取已有配置（升级时沿用）
getenv() { [[ -f $ENV_FILE ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 || true; }
[[ -n $DOMAIN ]] || DOMAIN="$(getenv XZB_DOMAIN)"
[[ -n $PORT ]] || PORT="$(getenv PORT)"; PORT="${PORT:-8787}"
[[ -n $DOMAIN ]] || die "首次安装请提供 --domain"
[[ $DOMAIN =~ ^[A-Za-z0-9.-]+$ ]] || die "域名格式不正确：$DOMAIN"
if [[ $TLS == auto ]]; then SCHEME=https; elif [[ $TLS == internal ]]; then SCHEME=https; else SCHEME=http; fi

# ---- 1. 系统依赖：Node 22（NodeSource）、Caddy（官方仓库） ----
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; }
if [[ $SKIP_APT -eq 0 ]]; then
  export DEBIAN_FRONTEND=noninteractive
  log "安装基础软件包"
  apt-get update -qq
  # python3/make/g++：better-sqlite3 在安装时本地编译
  apt-get install -y -qq ca-certificates curl gnupg rsync sqlite3 python3 make g++ >/dev/null
  install -d -m 0755 /etc/apt/keyrings
  if ! node_ok; then
    log "安装 Node.js 22（NodeSource）"
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq && apt-get install -y -qq nodejs >/dev/null
  fi
  if [[ $NO_CADDY -eq 0 ]] && ! command -v caddy >/dev/null; then
    log "安装 Caddy（官方 apt 仓库）"
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null || true
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
fi
node_ok || die "需要 Node.js ≥ 22.12（当前：$(node -v 2>/dev/null || echo 未安装)）"
NODE_BIN="$(command -v node)"; NPM_BIN="$(command -v npm)"
[[ $NODE_BIN == /usr/bin/node ]] || { warn "node 不在 /usr/bin/node，建立软链接"; ln -sf "$NODE_BIN" /usr/bin/node; }

# ---- 2. 系统用户与目录 ----
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "创建系统用户 $APP_USER"
  useradd --system --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin --user-group "$APP_USER"
fi
install -d -m 0755 -o root -g root "$OPT" "$OPT/releases"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$DATA"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$DATA/backups"
install -d -m 0750 -o root -g "$APP_USER" "$ETC"

# ---- 3. 配置文件（不存在才生成；不含任何密钥） ----
if [[ ! -f $ENV_FILE ]]; then
  log "生成 $ENV_FILE"
  cat > "$ENV_FILE" <<CONF
# 小账本服务配置（由 install.sh 生成，可手动修改后 systemctl restart $APP）
XZB_DOMAIN=$DOMAIN
HOST=127.0.0.1
PORT=$PORT
PUBLIC_ORIGIN=$SCHEME://$DOMAIN
DB_PATH=$DATA/$APP.db
WEB_ROOT=$OPT/current/dist
ALLOW_SIGNUP=false
TRUST_PROXY=loopback
SESSION_DAYS=30
SESSION_MAX_DAYS=180
LOG_LEVEL=info
CONF
else
  # 升级：只同步域名相关的两项，其余保留
  sed -i -e "s|^XZB_DOMAIN=.*|XZB_DOMAIN=$DOMAIN|" -e "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=$SCHEME://$DOMAIN|" -e "s|^PORT=.*|PORT=$PORT|" "$ENV_FILE"
fi
chown root:"$APP_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"

# ---- 4. 安装本版本程序 ----
DEST="$OPT/releases/$REL"
log "安装版本 $REL → $DEST"
TMP="$(mktemp -d "$OPT/releases/.tmp-XXXXXX")"
cp -a "$SRC/VERSION" "$SRC/dist" "$SRC/deploy" "$TMP/"
install -d "$TMP/server"
cp -a "$SRC/server/dist" "$SRC/server/package.json" "$SRC/server/package-lock.json" "$TMP/server/"
( cd "$TMP/server" && "$NPM_BIN" ci --omit=dev --no-audit --no-fund --loglevel=error ) || { rm -rf "$TMP"; die "安装 Node 依赖失败（better-sqlite3 需要 python3、make、g++）"; }
chown -R root:root "$TMP"; chmod -R u=rwX,go=rX "$TMP"
rm -rf "$DEST"; mv "$TMP" "$DEST"

run_cli() { ( umask 0027; set -a; . "$ENV_FILE"; set +a; cd "$1/server" && runuser -u "$APP_USER" -- "$NODE_BIN" dist/cli.js "${@:2}" ); }

# 升级前备份 + 迁移
if [[ -f $DATA/$APP.db ]]; then
  log "升级前备份数据库"
  run_cli "$DEST" backup --dir "$DATA/backups" --keep-days 14
fi
log "数据库迁移"
run_cli "$DEST" migrate

# 切换 current（原子操作），记住上一个版本用于回滚
PREV="$(readlink -f "$OPT/current" 2>/dev/null || true)"
ln -sfn "$DEST" "$OPT/current.new" && mv -Tf "$OPT/current.new" "$OPT/current"

# ---- 5. CLI 包装、systemd 服务与备份定时器 ----
install -m 0755 "$DEST/deploy/xiaozhangben-cli" /usr/local/bin/xiaozhangben-cli

health() {
  for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0; sleep 1; done; return 1
}
if [[ $HAS_SYSTEMD -eq 1 ]]; then
  log "安装 systemd 服务与每日备份定时器"
  install -m 0644 "$DEST"/deploy/systemd/xiaozhangben.service "$DEST"/deploy/systemd/xiaozhangben-backup.service "$DEST"/deploy/systemd/xiaozhangben-backup.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --quiet xiaozhangben.service xiaozhangben-backup.timer
  systemctl restart xiaozhangben.service
  systemctl start xiaozhangben-backup.timer
else
  warn "未检测到 systemd（容器环境？）：直接在后台启动服务，仅用于测试"
  pkill -u "$APP_USER" -f 'dist/index.js' 2>/dev/null || true; sleep 1
  ( set -a; . "$ENV_FILE"; set +a; cd "$OPT/current/server" && NODE_ENV=production nohup runuser -u "$APP_USER" -- "$NODE_BIN" dist/index.js >>/var/log/$APP.log 2>&1 & )
fi
if ! health; then
  warn "新版本健康检查失败"
  if [[ -n $PREV && $PREV != "$DEST" && -d $PREV ]]; then
    warn "回滚到 $PREV"; ln -sfn "$PREV" "$OPT/current.new" && mv -Tf "$OPT/current.new" "$OPT/current"
    [[ $HAS_SYSTEMD -eq 1 ]] && systemctl restart xiaozhangben.service
  fi
  [[ $HAS_SYSTEMD -eq 1 ]] && journalctl -u xiaozhangben -n 30 --no-pager || tail -n 30 /var/log/$APP.log
  die "安装失败"
fi
log "服务已在 127.0.0.1:$PORT 运行"

# ---- 6. Caddy ----
if [[ $NO_CADDY -eq 0 ]]; then
  command -v caddy >/dev/null || die "未安装 Caddy（或使用 --no-caddy）"
  log "配置 Caddy（$SCHEME://$DOMAIN，TLS=$TLS）"
  install -d -m 0755 /etc/caddy/conf.d
  case $TLS in
    auto) SITE="$DOMAIN"; TLSLINE="${ACME_EMAIL:+tls $ACME_EMAIL}" ;;
    internal) SITE="$DOMAIN"; TLSLINE="tls internal" ;;
    off) SITE="http://$DOMAIN"; TLSLINE="" ;;
  esac
  sed -e "s|{\$DOMAIN}|$SITE|" -e "s|{\$UPSTREAM:127.0.0.1:8787}|127.0.0.1:$PORT|" -e "s|#TLS#|$TLSLINE|" \
    "$DEST/deploy/Caddyfile" > /etc/caddy/conf.d/xiaozhangben.caddy
  MAIN=/etc/caddy/Caddyfile
  if [[ ! -f $MAIN ]] || grep -q 'The Caddyfile is an easy way' "$MAIN"; then
    if [[ -f $MAIN && ! -f $MAIN.orig ]]; then cp "$MAIN" "$MAIN.orig"; fi
    printf '# 由小账本 install.sh 管理；其他站点可放在 /etc/caddy/conf.d/*.caddy\nimport /etc/caddy/conf.d/*.caddy\n' > "$MAIN"
  elif ! grep -q 'import /etc/caddy/conf.d/\*.caddy' "$MAIN"; then
    warn "$MAIN 已有自定义内容，追加 import 行"
    printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> "$MAIN"
  fi
  caddy validate --config "$MAIN" --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config "$MAIN" --adapter caddyfile; die "Caddy 配置校验失败"; }
  if [[ $HAS_SYSTEMD -eq 1 ]]; then
    systemctl enable --quiet caddy
    if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl restart caddy; fi
  else
    caddy reload --config "$MAIN" --adapter caddyfile >/dev/null 2>&1 || (cd /etc/caddy && nohup caddy run --config "$MAIN" --adapter caddyfile >>/var/log/caddy-$APP.log 2>&1 &)
  fi
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
    log "ufw 已启用：放行 80/443"; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  fi
fi

# ---- 7. 清理旧版本 ----
cd "$OPT/releases"
{ ls -1t | grep -v -x -F "$REL" || true; } | tail -n +"$KEEP_RELEASES" | while read -r old; do [[ -n $old && -d $old ]] && rm -rf -- "$old"; done || true

log "完成：版本 $REL"
USERS="$(run_cli "$OPT/current" list-users 2>/dev/null | grep -c '@' || true)"
if [[ ${USERS:-0} -eq 0 ]]; then
  echo
  echo "还没有任何账号。创建第一个账号（会提示输入两次密码）："
  echo "  sudo xiaozhangben-cli create-user 你的邮箱 --admin"
fi
echo "访问：$SCHEME://$DOMAIN"
