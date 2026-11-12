import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import htmlPurge from 'vite-plugin-purgecss';
import { fileURLToPath, URL } from 'node:url';

/* Classes built dynamically (template literals / computed maps) that
   PurgeCSS cannot statically detect — safelisted so they survive. */
const DYNAMIC_CLASS_SAFELIST = [
  /* status / pill vocabulary (lib/format) */
  /^st-(approved|pending|rejected|info|muted|orange)$/,
  /pill/, /pill-status/,
  /* segmented buttons & calendar flags */
  /seg-btn/, /cal-flag/, /static-pill/, /f-(pending|approved)/,
  /* avatars */
  /avatar(-[a-z]+)?$/,
  /* tabs / modals / notifications */
  /^tab/, /^modal(-lg)?$/, /^notif/, /sdot/,
  /* form fields & toasts */
  /^field/, /invalid/, /^toast(-(error|success))?$/,
  /* buttons */
  /^btn(-sm|-primary)?$/,
  /* analytics bars */
  /ana-(bar-row|clk|track|fill|vl|nm)/,
  /* charts */
  /chart-wrap/, /tooltip/, /tt-(title|row)/, /donut-wrap|donut-box|donut-center/, /dept-(legend|row)/, /dot/, /name/, /nums/, /funnel-row|stage|track|bar|count/,
  /* layout / shell */
  /sidebar/, /topbar/, /logo(-img|-text|-name|-sub)?$/, /logout-/, /empty/, /card/, /sr-only/,
  /auth-(container|card|brand|mark|title|sub|field|inwrap|toggle|row|remember|hint|error|btn|demo)/,
  /nm$|^sl$/, /boot-splash/, /pulse/,
  /* generic states */
  /active$/, /on$/, /read$/, /off$/, /done$/, /row-flash$/, /search-hit$/, /event$/, /as-button$/,
];

export default defineConfig({
  plugins: [
    react(),
    /* Remove CSS that no page uses (esp. the login page, which uses a
       small fraction of app.css). Runs in production builds only. */
    // vite-plugin-purgecss's plugin typing predates Vite's PluginOption shape;
    // the plugin works correctly at build time — cast to satisfy tsc.
    (htmlPurge({
      safelist: DYNAMIC_CLASS_SAFELIST,
      /* PurgeCSS scans HTML + JS output for class names. */
    }) as unknown as import('vite').PluginOption),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /* base: '/' ensures all asset paths are root-relative so the SPA
     works when served from the same origin as the API in production. */
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  build: {
    outDir: 'dist',
    /* Source maps are disabled for production builds so build output contains
       only minified assets (no .map files, no source references). */
    sourcemap: false,
    /* esbuild minification is on by default in production; make it explicit. */
    cssMinify: 'esbuild',
    /* Split CSS per chunk so lazy route chunks only pull their own styles. */
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        /* Vendor (react / react-router-dom) split from app code so the
           login entry stays small and route chunks don't duplicate it. */
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
