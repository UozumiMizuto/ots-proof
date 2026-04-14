# Test Coverage Evaluation

Date: 2026-04-14 (UTC)

## Scope checked

- `src/otsProtocol.ts`
- `src/otsUtils.ts`
- `src/otsProtocol.test.ts`
- `src/otsProtocol.integration.test.ts`

## Result summary

### Well-covered area

`src/otsProtocol.ts` is covered strongly by both regression and integration tests.

- Core APIs are directly tested: path normalization, sorting, TLV hashing pipeline, SHA-256 determinism, and hex conversion round-trip.
- Tests include realistic binary fixtures, Unicode filenames, empty-file behavior, deep paths, and large file-set scenarios.

### Coverage gap

`src/otsUtils.ts` has **no direct unit tests** in the current suite.

Key untested behaviors include:

- filesystem recursion/filtering logic (`getAllFilesRecursive`)
- repository hash generation through fs abstraction (`generateRepoHash`)
- directory creation and error handling (`ensureOtsDir`)
- OpenTimestamps interaction (`stampHash`, `upgradeAll`, `getInfo`)
- timeout/retry/merge logic in `upgradeAll`

## Tooling status

A line/branch coverage run using Vitest could not be completed in this environment because the coverage provider package is unavailable under current registry policy.

Attempted command:

- `npx vitest run --config vitest.config.ts --coverage`

Observed error:

- `MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'`

## Risk assessment

- **Low risk in protocol regression** (`otsProtocol`) due to frozen-vector and integration tests.
- **Medium to high risk in operational behavior** (`otsUtils`) because most branch-heavy logic is currently untested.

## Recommended next test additions

1. Add `src/otsUtils.test.ts` with mocked fs and mocked `window.OpenTimestamps`.
2. Cover `upgradeAll` branches explicitly:
   - missing `pending.json`
   - stale vs fresh timestamps
   - successful upgrade -> `.ots` rewrite + registry delete
   - timeout/error path -> registry retained
   - merge conflict safety when registry changes during run
3. Add deterministic tests for `getAllFilesRecursive` filtering of `.git` and `/.tool/settings/ots`.
4. When policy allows dependency install, add `@vitest/coverage-v8` and enforce thresholds in CI.
