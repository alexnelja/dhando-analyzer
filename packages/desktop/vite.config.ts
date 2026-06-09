import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5274,
    strictPort: true,
    proxy: {
      '/api/eodhd': {
        target: 'https://eodhd.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/eodhd/, '/api'),
      },
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com/v8/finance/chart',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      },
      '/api/polymarket': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/polymarket/, ''),
      },
      '/api/claude': {
        target: 'https://api.anthropic.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/claude/, ''),
      },
    },
  },
  // NOTE: API keys are intentionally NOT baked into the renderer bundle — that
  // would ship the developer's keys to every user. In Electron the renderer
  // calls APIs over IPC and the main process supplies per-user keys (Settings).
});
