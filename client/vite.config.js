import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + websocket to the Node backend (default port 4000),
// so the client talks to same-origin /api and /ws in both dev and prod.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
