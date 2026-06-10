# Known Bugs

## Flaky CI: Vitest 4 worker fork crash in core tests (Linux)

- Repro: nondeterministic — `pnpm test` on ubuntu CI occasionally fails with
  `[vitest-pool]: Worker forks emitted error. Caused by: Worker exited unexpectedly`
  after 66/67 core test files pass (first seen PR #11 run 27272772478; rerun passed).
- Expected: all 67 core test files complete.
- Actual: one worker fork dies (suspected better-sqlite3 native module crash or
  runner OOM under Vitest 4's forks pool). Never reproduced locally (macOS/arm64).
- File(s): packages/core vitest run; no specific test file identified yet.
- Workaround: `gh run rerun <id> --failed`. If it recurs, try
  `poolOptions: { forks: { singleFork: true } }` in core's vitest config on CI.

Record new bugs here as:

```
## <short title>
- Repro: …
- Expected: …
- Actual: …
- File(s): …
```
