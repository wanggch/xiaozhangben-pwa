# 小账本 · 容器镜像（Node 服务同时提供前端静态文件；HTTPS 由 docker-compose 中的 Caddy 负责）
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --no-audit --no-fund
COPY . .
RUN npm run build && cd server && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DB_PATH=/data/xiaozhangben.db WEB_ROOT=/app/dist
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/server/dist ./server/dist
COPY --from=build /src/server/node_modules ./server/node_modules
COPY --from=build /src/server/package.json ./server/
RUN mkdir -p /data/backups && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
WORKDIR /app/server
CMD ["node", "dist/index.js"]
