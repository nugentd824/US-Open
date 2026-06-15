import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + websocket to the Node backend (default port 4000),
// so the client talks to same-origin /api and /ws in both dev and prod.
export default defineConfig({
  plugins: [react()],
  build: {
    // On Vercel (which sets VERCEL=1) emit to a repo-root `dist` — that's where
    // Vercel looks for the static output. Locally and for the single-server /
    // Render build, keep the default client/dist (served by the Node server).
    outDir: process.env.VERCEL ? '../dist' : 'dist',
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
