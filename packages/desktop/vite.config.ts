import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig(({ mode }) => {
  // Load env from monorepo root (../../.env) so ANTHROPIC_API_KEY etc. are picked up.
  const env = loadEnv(mode, path.resolve(process.cwd(), '../../'), '');
  return defineConfig({
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
  define: {
    // Expose the Anthropic key to the browser renderer for the proxy fallback.
    // Only set when the env var is present; never undefined in Electron (handled server-side).
    'import.meta.env.VITE_ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY ?? ''),
    'import.meta.env.VITE_EODHD_API_KEY': JSON.stringify(env.EODHD_API_KEY ?? ''),
  },
  });
});
