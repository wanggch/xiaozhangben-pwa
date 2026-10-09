#!/usr/bin/env bash
# 小账本 · 服务器安装/升级脚本（幂等，可重复执行）
# 适用：Ubuntu 22.04 / 24.04、Debian 12 / 13（x86_64 或 arm64），需 root 或 sudo。
# 在「解压后的部署包」目录中运行（release.sh 会自动上传并执行）：
#   sudo bash deploy/install.sh --domain ledger.example.com [--acme-email you@example.com]
# 选项：
#   --domain D        站点域名（首次安装必填；之后会记住，可省略）
#   --acme-email E    证书账户邮箱（可选，仅 Caddy 模式使用）
#   --tls MODE        auto（默认，HTTPS）| internal（Caddy 自签）| off（仅 HTTP）
#   --port P          Node 监听端口（仅本机 127.0.0.1，默认 8787）
#   --node-bin PATH   指定 node 可执行文件（默认：/opt/xiaozhangben/node/bin/node，再退回 PATH）
#   --no-caddy        不安装/配置 Caddy（已有 Nginx 等反代时必用）
#   --write-nginx     写入 /etc/nginx/sites-available/<域名>（HTTP 模板；证书交给 certbot）
#   --skip-apt        跳过 apt 安装（已有编译工具与 Node 时）
# 目录：程序 /opt/xiaozhangben/releases/<版本>（current 软链接），
#       数据 /var/lib/xiaozhangben，配置 /etc/xiaozhangben/env
# 不会：apt upgrade、改防火墙、卸载/覆盖系统已有的 Node、碰其他站点配置。
set -Eeuo pipefail

APP=xiaozhangben
APP_USER=xiaozhangben
OPT=/opt/$APP
DATA=/var/lib/$APP
ETC=/etc/$APP
ENV_FILE=$ETC/env
KEEP_RELEASES=5

DOMAIN=""; ACME_EMAIL=""; TLS=auto; PORT=""; NODE_BIN_OPT=""; NO_CADDY=0; WRITE_NGINX=0; SKIP_APT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --acme-email) ACME_EMAIL="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --node-bin) NODE_BIN_OPT="$2"; shift 2 ;;
    --no-caddy) NO_CADDY=1; shift ;;
    --write-nginx) WRITE_NGINX=1; shift ;;
    --skip-apt) SKIP_APT=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
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

getenv() { [[ -f $ENV_FILE ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 || true; }
[[ -n $DOMAIN ]] || DOMAIN="$(getenv XZB_DOMAIN)"
[[ -n $PORT ]] || PORT="$(getenv PORT)"; PORT="${PORT:-8787}"
[[ -n $DOMAIN ]] || die "首次安装请提供 --domain"
[[ $DOMAIN =~ ^[A-Za-z0-9.-]+$ ]] || die "域名格式不正确：$DOMAIN"
[[ $PORT =~ ^[0-9]+$ && $PORT -ge 1 && $PORT -le 65535 ]] || die "端口不正确：$PORT"
if command -v ss >/dev/null && ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q LISTEN; then
  # 允许本服务已在跑（升级时）
  if ! curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    die "端口 $PORT 已被其他进程占用，请换 --port"
  fi
fi
if [[ $TLS == off ]]; then SCHEME=http; else SCHEME=https; fi

# ---- 1. 系统依赖（不 apt upgrade；不覆盖系统 Node） ----
node_version_ok() {
  local bin="$1"
  [[ -x $bin ]] || return 1
  "$bin" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' 2>/dev/null
}
pick_node() {
  local cand
  for cand in "$NODE_BIN_OPT" "$OPT/node/bin/node" "$(command -v node 2>/dev/null || true)"; do
    [[ -n ${cand:-} ]] || continue
    if node_version_ok "$cand"; then echo "$cand"; return 0; fi
  done
  return 1
}
if [[ $SKIP_APT -eq 0 ]]; then
  export DEBIAN_FRONTEND=noninteractive
  log "安装基础软件包（不升级系统）"
  apt-get update -qq
  # python3/make/g++：better-sqlite3 本地编译；不装 nodesource / 不碰已有 node
  apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg rsync sqlite3 python3 make g++ >/dev/null
  if ! pick_node >/dev/null; then
    log "未找到可用 Node ≥ 22.12，安装私有 Node 22 到 $OPT/node（不改系统 PATH）"
    ARCH="$(uname -m)"; case "$ARCH" in x86_64) NARCH=x64 ;; aarch64|arm64) NARCH=arm64 ;; *) die "不支持的架构 $ARCH" ;; esac
    VER=22.20.0
    command -v xz >/dev/null || apt-get install -y -qq --no-install-recommends xz-utils >/dev/null
    TMPN="$(mktemp -d)"; curl -fsSL "https://nodejs.org/dist/v$VER/node-v$VER-linux-$NARCH.tar.xz" -o "$TMPN/node.tar.xz"
    tar -xJf "$TMPN/node.tar.xz" -C "$TMPN"
    rm -rf "$OPT/node"; mv "$TMPN"/node-v$VER-linux-$NARCH "$OPT/node"
    rm -rf "$TMPN"
  fi
  if [[ $NO_CADDY -eq 0 ]] && ! command -v caddy >/dev/null; then
    log "安装 Caddy（官方 apt 仓库）"
    install -d -m 0755 /etc/apt/keyrings /usr/share/keyrings
    apt-get install -y -qq --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https >/dev/null || true
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
fi
NODE_BIN="$(pick_node)" || die "需要 Node.js ≥ 22.12（可用 --node-bin 或把二进制放到 $OPT/node）"
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[[ -x $NPM_BIN ]] || NPM_BIN="$(command -v npm)" || die "找不到与 node 配套的 npm"
log "使用 Node：$NODE_BIN ($("$NODE_BIN" -v))"

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
NODE_BIN=$NODE_BIN
CONF
else
  # 升级：同步域名 / 端口 / PUBLIC_ORIGIN / NODE_BIN，其余保留
  grep -q '^NODE_BIN=' "$ENV_FILE" || echo "NODE_BIN=$NODE_BIN" >> "$ENV_FILE"
  sed -i -e "s|^XZB_DOMAIN=.*|XZB_DOMAIN=$DOMAIN|" \
         -e "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=$SCHEME://$DOMAIN|" \
         -e "s|^PORT=.*|PORT=$PORT|" \
         -e "s|^NODE_BIN=.*|NODE_BIN=$NODE_BIN|" \
         "$ENV_FILE"
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

if [[ -f $DATA/$APP.db ]]; then
  log "升级前备份数据库"
  run_cli "$DEST" backup --dir "$DATA/backups" --keep-days 14
fi
log "数据库迁移"
run_cli "$DEST" migrate

PREV="$(readlink -f "$OPT/current" 2>/dev/null || true)"
ln -sfn "$DEST" "$OPT/current.new" && mv -Tf "$OPT/current.new" "$OPT/current"

# ---- 5. CLI 包装、systemd 服务与备份定时器 ----
# CLI / 服务单元都使用 env 里的 NODE_BIN，不硬编码 /usr/bin/node，也不改系统 PATH
sed "s|@NODE_BIN@|$NODE_BIN|g" "$DEST/deploy/xiaozhangben-cli" > /usr/local/bin/xiaozhangben-cli
chmod 0755 /usr/local/bin/xiaozhangben-cli

health() {
  for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0; sleep 1; done; return 1
}
if [[ $HAS_SYSTEMD -eq 1 ]]; then
  log "安装 systemd 服务与每日备份定时器"
  sed "s|@NODE_BIN@|$NODE_BIN|g" "$DEST/deploy/systemd/xiaozhangben.service" > /etc/systemd/system/xiaozhangben.service
  sed "s|@NODE_BIN@|$NODE_BIN|g" "$DEST/deploy/systemd/xiaozhangben-backup.service" > /etc/systemd/system/xiaozhangben-backup.service
  install -m 0644 "$DEST/deploy/systemd/xiaozhangben-backup.timer" /etc/systemd/system/
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

# ---- 6. 反代：Caddy 或写出 Nginx 模板 ----
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
elif [[ $WRITE_NGINX -eq 1 ]]; then
  command -v nginx >/dev/null || die "--write-nginx 需要已安装 nginx"
  NGINX_AVAIL=/etc/nginx/sites-available/$DOMAIN
  NGINX_EN=/etc/nginx/sites-enabled/$DOMAIN
  if [[ -f $NGINX_AVAIL ]] && grep -q 'ssl_certificate' "$NGINX_AVAIL"; then
    log "Nginx 站点已有证书配置，只更新反代端口（不改证书段）"
    # 已由 certbot 管理时，只把 proxy_pass 端口改成当前 PORT
    sed -i -E "s|proxy_pass http://127\\.0\\.0\\.1:[0-9]+;|proxy_pass http://127.0.0.1:$PORT;|" "$NGINX_AVAIL"
  else
    log "写入 Nginx 站点 $NGINX_AVAIL（HTTP；证书请用 certbot --nginx）"
    sed -e "s/DOMAIN/$DOMAIN/g" -e "s/UPSTREAM_PORT/$PORT/g" \
      "$DEST/deploy/nginx-site.conf.example" > "$NGINX_AVAIL"
  fi
  ln -sfn "$NGINX_AVAIL" "$NGINX_EN"
  nginx -t
  systemctl reload nginx
  log "Nginx 已 reload。若尚未有证书：certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect"
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
