import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 前端与后端同域部署（后端 Node 服务提供静态文件与 /api），路径固定为 /
// 本地开发：npm run dev（Vite，/api 代理到 http://127.0.0.1:8787 的后端）
const base = '/';
const API = process.env.API_URL || 'http://127.0.0.1:8787';

export default defineConfig(() => {
return {
  base,
  build: {
    target: 'es2020', cssCodeSplit: true, assetsInlineLimit: 0, sourcemap: false, modulePreload: { polyfill: false },
    rollupOptions: {
      input: { index: 'index.html', login: 'login.html' },
      output: {
        // 登录页的脚本与样式放在公开目录 pub/，App 的 assets/ 需要登录才能访问
        entryFileNames: c => c.name === 'login' ? 'pub/[name]-[hash].js' : 'assets/[name]-[hash].js',
        assetFileNames: a => (a.names ?? []).some(n => n.startsWith('login')) ? 'pub/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { proxy: { '/api': { target: API, changeOrigin: false } } },
  plugins: [
    {
      name: 'login-route', // 开发时 /login → login.html（生产环境由后端处理）
      configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.url === '/login' || req.url?.startsWith('/login?')) req.url = req.url.replace('/login', '/login.html'); next(); }); },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        id: base,
        name: '小账本',
        short_name: '小账本',
        description: '极简、安静的离线记账 App：多账本、多账户、预算、周期账单、日历与统计，数据只保存在你的设备上。',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#F6F6F4',
        background_color: '#F6F6F4',
        categories: ['finance', 'productivity', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: '记一笔', short_name: '记一笔', url: base + '?action=record', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
        screenshots: [
          { src: 'screenshots/home-light.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: '账单首页' },
          { src: 'screenshots/stats-light.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: '统计' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['screenshots/**', 'icons/icon-1024.png', 'login.html', 'pub/**'],
        navigateFallback: 'index.html',
        // 登录页与 API 永远走网络
        navigateFallbackDenylist: [/^\/login/, /^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
};
});
