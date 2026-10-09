import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 部署路径：默认 /（本地开发、Vercel / Netlify / Cloudflare Pages）
// GitHub Pages 子路径：npm run build:pages（= --mode pages → /xiaozhangben-pwa/），或 BASE=/仓库名/ npm run build
export default defineConfig(({ mode }) => {
const raw = process.env.BASE || (mode === 'pages' ? '/xiaozhangben-pwa/' : '/');
const base = ('/' + raw + '/').replace(/\/+/g, '/');

return {
  base,
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 0, sourcemap: false },
  plugins: [
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
        globIgnores: ['screenshots/**', 'icons/icon-1024.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
};
});
