# BananaTool — AIF Pilot Baseline

**Status:** recorded before implementation changes  
**Branch:** `codex/aif-pilot-initialization`

## What was verified

| Check | Result | Notes |
|---|---|---|
| TypeScript project build (`tsc -b`) | Pass | No type errors reported. |
| Vite production build | Pass | Completed in the ordinary local environment. Output JavaScript is about 395 KB before gzip. |
| ESLint | Fail | Two errors and two warnings in `src/App.tsx`; see below. |
| Automated tests | Not configured | `package.json` has no test script or test dependencies. |
| CI workflow | Not present | No repository workflow directory is present. |

## Lint findings

1. `src/App.tsx:282` — synchronous `setCloudHistoryLoading(true)` in an effect triggers `react-hooks/set-state-in-effect`.
2. `src/App.tsx:297` — synchronous `setDnaLibraryLoading(true)` in an effect triggers the same rule.
3. `src/App.tsx:458` — the prompt-building callback omits `sceneDna` from its dependency list.
4. `src/App.tsx:473` — the prompt-enhancement callback omits `jsonDna` from its dependency list.

The first two are current lint errors; the latter two are warnings. They must be resolved or explicitly justified before the pilot can claim a clean quality gate.

## Environment limitation discovered

The workstation's system `npm` executable is incomplete, while this repository has an `npm` lockfile. Dependencies were installed locally with the bundled `pnpm` runtime without generating or committing a new lockfile. That allowed baseline lint, type-check, and build checks, but it is not a substitute for a clean `npm ci` result.

The Vite build initially failed inside the restricted filesystem sandbox because its bundler could not inspect a parent directory. The same build passed outside that restriction; this is an execution-environment limitation, not currently evidence of a project build defect.

## Immediate follow-up order

1. Repair the clean npm toolchain or use an explicitly approved package-manager migration.
2. Fix the four lint findings with regression tests.
3. Introduce a test runner and CI quality gate.
4. Modernize the Gemini SDK and model registry behind validated capability checks.
5. Move API calls to a server-side boundary before any production deployment.

## Scope note

No paid model request, deployment, or Supabase data mutation was performed while establishing this baseline.
