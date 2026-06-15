import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev server proxies API + websocket to the Node backend (default port 4000),
// so the client talks to same-origin /api and /ws in both dev and prod.
export default defineConfig({
  plugins: [react()],
  build: {
    // On Vercel, the build runs from the repo root while Vite runs inside
    // client/, so Vite's default client/dist is NOT where Vercel looks for the
    // output. When the Vercel build command sets DEPLOY_TARGET=vercel, emit to
    // the repo-root `dist` using an ABSOLUTE path (cwd-independent) so it lands
    // exactly where Vercel expects. Local and single-server/Render builds keep
    // the default client/dist (served by the Node server).
    outDir:
      process.env.DEPLOY_TARGET === 'vercel' ? path.resolve(__dirname, '..', 'dist') : 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
