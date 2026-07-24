# Svelte Phase 3 verification record

Status: **open**. This record is intentionally not a release sign-off.

## Environment

- Branch: `codex/phase-3-svelte-rendering`
- Node: `v22.18.0`
- Package manager: `pnpm 10.14.0`
- Svelte toolchain metadata: `svelte 5.19.2`, `UnoCSS 65.4.3`

## Automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| SQLite/unit suite | pass | `pnpm test -- --maxWorkers=1`: 64 files, 366 tests |
| D1 suite | pass | `pnpm run test:d1 -- --maxWorkers=1`: 8 files, 35 tests; includes `render-artifact.d1.ts` near-limit contract coverage |
| Cloudflare build | pass | `pnpm run build:cf` completes with the Cloudflare adapter |
| Standard build | blocked by repository setup | `pnpm run build` fails with Astro `NoAdapterInstalled`; this repository uses `build:cf` for server output |
| Lint | blocked by existing baseline | `pnpm run lint` reports 405 errors across legacy docs, generated files, scripts, and user-owned local files |
| Astro check | blocked by existing baseline | `pnpm exec astro check` reports 47 errors after Phase 3-specific D1 typing fixes |
| Browser suite | incomplete | focused import/export (3/3), Worker toolchain (4/4), and Markdown startup lazy-load tests pass; two full 47-test runs each stopped at 44/47 because of dev-server concurrency or shared SQLite test-order state, so neither is release evidence |

## Covered behavior

- Source hash, migrations, source-save currentness, exact reversion, replaced Artifact history, trash/restore/purge: SQLite and D1 contracts.
- Artifact budgets, hashes, dependency drift confirmation, canonical Snapshot rules, resource ETags and revalidation: unit/API tests.
- Worker compiler, resolver policy, browser Rollup bundle, UnoCSS root scope, Preview RPC, same-origin DOM mounting, and JavaScript-disabled Snapshot: unit and focused browser tests.
- Browser batch rebuild records `dependency_changed` without confirmation; import saves Source before best-effort Svelte rebuild; sync-vault derives renderer from `.md`/`.svelte` and reports `rebuild_required`.
- Preview now waits for an opaque `srcdoc` readiness message; import keeps its Snapshot iframe visually hidden but layout-participating so the canonical two-frame Snapshot capture can finish.
- Legacy `/playground` and `/api/playground/compile` are deleted.

## Bundle inspection

- `artifact.worker-*.js` dynamically imports the published same-origin `rollup.browser-*` asset.
- Worker toolchain assets are published lazily as designed. Ordinary public delivery mounts stored Artifacts and does not compile or bundle Svelte.
- The editor entry imports `unocss-profile` only for pinned Artifact metadata/config hash; it does not import the UnoCSS generator. This distinction must remain part of any future bundle check.

## Required remaining evidence

- Run the complete Playwright suite to a final pass/fail summary in an environment that reliably returns the process result.
- Resolve or formally baseline the lint and Astro-check diagnostics before claiming the automated gate passes.
- Complete real-device checklist: native Chinese IME, physical touch, narrow mobile layout, JavaScript-disabled public Snapshot, initial mount failure, and dependency-network restrictions.
- Obtain user sign-off before any production migration or maintenance operation.
