#!/usr/bin/env bash
# 本地打包：构建前端与后端，生成 release/xiaozhangben-<版本>.tar.gz（不含 node_modules、数据与任何密钥）
# 用法：bash deploy/package.sh        （输出最后一行为包路径）
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v node >/dev/null || { echo "需要 Node.js 22" >&2; exit 1; }

VER="$(node -p 'require("./package.json").version')-$(date +%Y%m%d%H%M)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
[[ -n $SHA ]] && VER="$VER-$SHA" && { git diff --quiet HEAD 2>/dev/null || VER="$VER-dirty"; }

echo "==> 构建前端" >&2
[[ -d node_modules ]] || npm ci --no-audit --no-fund >&2
npm run build >&2
echo "==> 构建后端" >&2
( cd server && { [[ -d node_modules ]] || npm ci --no-audit --no-fund; } && npm run build ) >&2

NAME="xiaozhangben-$VER"
STAGE="$ROOT/release/pkg/$NAME"
rm -rf "$ROOT/release/pkg"; mkdir -p "$STAGE/server"
cp -a dist "$STAGE/dist"
cp -a server/dist server/package.json server/package-lock.json "$STAGE/server/"
mkdir -p "$STAGE/deploy"
cp -a deploy/install.sh deploy/Caddyfile deploy/xiaozhangben-cli deploy/systemd deploy/nginx-site.conf.example "$STAGE/deploy/"
cp -a .env.example "$STAGE/"
echo "$VER" > "$STAGE/VERSION"
find "$STAGE" \( -name '*.map' -o -name '.env' -o -name '*.db' -o -name '*.db-*' \) -delete
OUT="$ROOT/release/$NAME.tar.gz"
tar -C "$ROOT/release/pkg" -czf "$OUT" "$NAME"
rm -rf "$ROOT/release/pkg"
echo "==> 已生成 $(du -h "$OUT" | cut -f1) $OUT" >&2
echo "$OUT"
