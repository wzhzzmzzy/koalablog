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
| Astro check | pass with existing hints | `pnpm exec astro check`: 0 errors, 9 pre-existing hints |
| Browser suite | pass | `pnpm exec playwright test --reporter=list`: 47/47 tests. The suite uses one worker and restores the complete SQLite fixture before every test, so it no longer relies on cross-file timing or prior test mutations. |

## Covered behavior

- Source hash, migrations, source-save currentness, exact reversion, replaced Artifact history, trash/restore/purge: SQLite and D1 contracts.
- Artifact budgets, hashes, dependency drift confirmation, canonical Snapshot rules, resource ETags and revalidation: unit/API tests.
- Worker compiler, resolver policy, browser Rollup bundle, UnoCSS root scope, Preview RPC, same-origin DOM mounting, and JavaScript-disabled Snapshot: unit and focused browser tests.
- Browser batch rebuild records `dependency_changed` without confirmation; import saves Source before best-effort Svelte rebuild; sync-vault derives renderer from `.md`/`.svelte` and reports `rebuild_required`.
- Preview now waits for an opaque `srcdoc` readiness message; import keeps its Snapshot iframe visually hidden but layout-participating so the canonical two-frame Snapshot capture can finish.
- The E2E seed includes the initialized default memo Template Catalog, two trashed Files, and current/drift Svelte Artifacts. Its reset restores this complete product state without removing the database file held by the Astro process.
- Legacy `/playground` and `/api/playground/compile` are deleted.

## Bundle inspection

- `artifact.worker-*.js` dynamically imports the published same-origin `rollup.browser-*` asset.
- Worker toolchain assets are published lazily as designed. Ordinary public delivery mounts stored Artifacts and does not compile or bundle Svelte.
- The editor entry imports `unocss-profile` only for pinned Artifact metadata/config hash; it does not import the UnoCSS generator. This distinction must remain part of any future bundle check.

## Required remaining evidence

- Resolve or formally baseline the repository-wide lint diagnostics before claiming every quality gate passes.
- Complete real-device checklist: native Chinese IME, physical touch, narrow mobile layout, JavaScript-disabled public Snapshot, initial mount failure, and dependency-network restrictions.
- Obtain user sign-off before any production migration or maintenance operation.
