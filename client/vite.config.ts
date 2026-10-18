import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/* The portal build is served by the Express API from server/public:
 *   npm run build   →   copy dist/* into server/public
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /* `npm run dev` proxies API calls to the local Express server so the
     real session/data flow works without building the portal first.
     (If the server is not running, the app falls back to the demo.) */
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
