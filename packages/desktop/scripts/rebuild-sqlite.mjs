// Deterministically rebuild better-sqlite3 for a target runtime's ABI.
//
//   node scripts/rebuild-sqlite.mjs electron   → Electron ABI (before `pnpm dev`)
//   node scripts/rebuild-sqlite.mjs node       → Node ABI     (before `pnpm test`)
//
// The shared node_modules can hold only one ABI at a time. We invoke
// prebuild-install DIRECTLY against better-sqlite3 with the right `-r/-t`
// (it then fetches e.g. better-sqlite3-v12.10.0-electron-v132-…). We do NOT go
// through `pnpm rebuild` — pnpm doesn't propagate npm_config_runtime to the
// install script, so it always rebuilt for Node. @electron/rebuild is also out
// (its CLI crashes on Node 26's yargs; its API can't traverse pnpm's layout).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const runtime = process.argv[2] === 'electron' ? 'electron' : 'node';
const target =
  runtime === 'electron'
    ? require('electron/package.json').version
    : process.versions.node;

const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'));
const binary = path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node');
// prebuild-install is a dependency of better-sqlite3; resolve its CLI from there.
const prebuildBin = require.resolve('prebuild-install/bin.js', { paths: [pkgDir] });

console.log(`[rebuild-sqlite] better-sqlite3 → ${runtime} ${target}`);
fs.rmSync(binary, { force: true });
execFileSync(process.execPath, [prebuildBin, '-r', runtime, '-t', target, '--force'], {
  cwd: pkgDir,
  stdio: 'inherit',
});

if (!fs.existsSync(binary)) {
  throw new Error('[rebuild-sqlite] no binary produced — prebuild-install may lack this target');
}
console.log('[rebuild-sqlite] done');
