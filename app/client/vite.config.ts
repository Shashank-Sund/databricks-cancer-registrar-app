import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The FastAPI backend (app/server) implements contracts/api_contract.md.
// In dev we proxy /api to it if it is running; otherwise the app uses the
// in-memory mock (VITE_USE_MOCK=true by default, see src/api/client.ts).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Optional: inject a Bearer token (dev only) so the dev server can talk
        // to a deployed, OAuth-gated Databricks App backend for local testing
        // against real data. Never used by the production build (FastAPI serves
        // the static client there). Token is read from env, never hardcoded.
        configure: (proxy) => {
          const token = process.env.VITE_PROXY_TOKEN;
          if (token) {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${token}`);
            });
          }
        },
      },
    },
  },
  build: {
    // Build directly into the FastAPI server's static dir. `npm run build`
    // therefore produces app/server/static, which main.py serves in production.
    // emptyOutDir must be explicit because outDir is outside the Vite root.
    outDir: '../server/static',
    emptyOutDir: true,
    sourcemap: false,
  },
});
