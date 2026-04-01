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
    port: 5173,
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
    },
  },
});
