#!/usr/bin/env bash
# 本地一键发布：打包 → 上传到服务器 → 远程执行 install.sh（首次安装与升级都用它）
# 用法：
#   bash deploy/release.sh --host 1.2.3.4 --domain ledger.example.com --key ~/.ssh/id_ed25519 [--user root] [--port 22]
#                         [--app-port 8787] [--acme-email you@example.com] [--tls auto|internal|off]
#                         [--no-caddy] [--write-nginx] [--node-bin /path/to/node] [--skip-apt]
#                         [--package 已有包.tar.gz] [--dry-run]
# 说明：
#   --port 是 SSH 端口；Node 监听端口用 --app-port（传给 install.sh --port）
#   --user 非 root 时远程用 sudo（需要该用户有 sudo 权限）
#   --dry-run 只打包并打印将要执行的命令，不连接服务器
set -Eeuo pipefail
HOST=""; SSH_USER=root; DOMAIN=""; KEY=""; PORT=22; APP_PORT=""; ACME_EMAIL=""; TLS=auto
PKG=""; DRY=0; NO_CADDY=0; WRITE_NGINX=0; SKIP_APT=0; NODE_BIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) SSH_USER="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --acme-email) ACME_EMAIL="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --node-bin) NODE_BIN="$2"; shift 2 ;;
    --package) PKG="$2"; shift 2 ;;
    --no-caddy) NO_CADDY=1; shift ;;
    --write-nginx) WRITE_NGINX=1; shift ;;
    --skip-apt) SKIP_APT=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done
[[ -n $HOST && -n $DOMAIN ]] || { echo "需要 --host 与 --domain（--help 查看用法）" >&2; exit 2; }
[[ -z $KEY || -f $KEY ]] || { echo "找不到 SSH 私钥：$KEY" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ -n $PKG ]] || PKG="$(bash "$ROOT/deploy/package.sh" | tail -1)"
[[ -f $PKG ]] || { echo "找不到部署包：$PKG" >&2; exit 1; }
NAME="$(basename "$PKG" .tar.gz)"

SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15)
[[ -n $KEY ]] && SSH_OPTS+=(-i "$KEY" -o IdentitiesOnly=yes)
TARGET="$SSH_USER@$HOST"
SUDO=""; [[ $SSH_USER == root ]] || SUDO="sudo"
REMOTE_DIR="/tmp/xzb-release"
q() { printf '%q ' "$@"; }
INSTALL_ARGS=(--domain "$DOMAIN" --tls "$TLS")
[[ -n $ACME_EMAIL ]] && INSTALL_ARGS+=(--acme-email "$ACME_EMAIL")
[[ -n $APP_PORT ]] && INSTALL_ARGS+=(--port "$APP_PORT")
[[ -n $NODE_BIN ]] && INSTALL_ARGS+=(--node-bin "$NODE_BIN")
[[ $NO_CADDY -eq 1 ]] && INSTALL_ARGS+=(--no-caddy)
[[ $WRITE_NGINX -eq 1 ]] && INSTALL_ARGS+=(--write-nginx)
[[ $SKIP_APT -eq 1 ]] && INSTALL_ARGS+=(--skip-apt)
REMOTE_CMD="set -e; cd $REMOTE_DIR && rm -rf $(q "$NAME") && tar xzf $(q "$NAME.tar.gz") && $SUDO bash $(q "$NAME/deploy/install.sh") $(q "${INSTALL_ARGS[@]}"); cd / && rm -rf $REMOTE_DIR"

run() { if [[ $DRY -eq 1 ]]; then echo "+ $(q "$@")"; else "$@"; fi; }
echo "==> 上传 $(basename "$PKG") 到 $TARGET:$PORT" >&2
run ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p $REMOTE_DIR"
if command -v rsync >/dev/null && { [[ $DRY -eq 1 ]] || ssh "${SSH_OPTS[@]}" "$TARGET" "command -v rsync" >/dev/null 2>&1; }; then
  run rsync -az --partial -e "ssh $(q "${SSH_OPTS[@]}")" "$PKG" "$TARGET:$REMOTE_DIR/"
else
  run scp -P "$PORT" "${SSH_OPTS[@]:2}" "$PKG" "$TARGET:$REMOTE_DIR/"
fi
echo "==> 远程安装" >&2
run ssh -t "${SSH_OPTS[@]}" "$TARGET" "$REMOTE_CMD"
[[ $DRY -eq 1 ]] && echo "（--dry-run：未连接服务器）" >&2 || echo "==> 完成：$([[ $TLS == off ]] && echo http || echo https)://$DOMAIN" >&2
