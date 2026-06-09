// Rebuild native modules (better-sqlite3) for Electron's ABI.
//
// pnpm-aware: we run `pnpm rebuild better-sqlite3` with prebuild-install's
// Electron target env vars set, so it fetches Electron's prebuilt binary into
// the correct .pnpm location (no compiler needed). @electron/rebuild's CLI is
// broken on Node 26 and its API doesn't traverse pnpm's layout, so we avoid it.
//
// Run before launching the app (`predev`). Pair with `rebuild:node`
// (`pnpm rebuild better-sqlite3`) before tests — the shared node_modules can
// hold only one ABI at a time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

console.log(`[rebuild-electron] better-sqlite3 → Electron ${electronVersion}`);

execSync('pnpm rebuild better-sqlite3', {
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
  },
});

console.log('[rebuild-electron] done');
