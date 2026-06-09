import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Desktop test runner.
 *
 * Default environment is `node` (for Electron-free IPC-handler logic tests).
 * React hook/component tests opt into jsdom per-file with a docblock:
 *   // @vitest-environment jsdom
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
