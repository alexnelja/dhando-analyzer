# Contributing

## Setup

```bash
pnpm install
cp .env.example .env   # optional dev fallback for API keys (the app also has a Settings page)
pnpm build
pnpm test
```

## Workflow

- **Tests first (TDD).** Write a failing test, then implement. New behaviour needs coverage.
- **Run the full Electron app** when testing desktop changes — not browser-only mode.
- Keep commits narrow and additive; this repo often has concurrent work in flight.

## Native module ABI (better-sqlite3)

`better-sqlite3` is native, and Electron and Node use different ABIs from one
shared `node_modules`. The scripts toggle it for you:

- `pnpm --filter @dhando/desktop dev` → `predev` builds it for **Electron**.
- `pnpm test` → `pretest` builds it for **Node**.

Hitting `NODE_MODULE_VERSION` errors? Run `pnpm --filter @dhando/desktop rebuild:electron`
or `…rebuild:node`. See the README "Native module ABI" section.

## Secrets

Never commit API keys. Each user enters their own in the in-app **Settings**
screen (stored locally in their `userData` DB); keys are not bundled.

## CI

`pnpm build` + `pnpm test` run on every push/PR (`.github/workflows/ci.yml`).
Pushing a `v*` tag builds installers on all platforms and attaches them to the
GitHub Release (`.github/workflows/release.yml`).
