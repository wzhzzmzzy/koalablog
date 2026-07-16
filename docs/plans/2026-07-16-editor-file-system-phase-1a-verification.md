# Gate 1A Verification Record

Date: 2026-07-16
Branch: `codex/editor-files-phase-1a`
Base: `main` at `0edb5668d0431025c4698f3fa761dfcb669222be`

## Delivered seams

- Absolute, extensionless File Path and Path Prefix parsing.
- Creation Template v1 validation, longest-Prefix selection, and deterministic instantiation.
- Markdown Source analysis for tags and absolute `[[/path]]` references without DOM rendering.
- Durable, scope-preserving GlobalConfig updates for local and Cloudflare storage.
- Versioned Template Catalog storage with optimistic revision replacement for SQLite and D1.
- One-time `/memo/` preset initialization for onboarding and existing ready installations.

No Save/import caller uses the new Source analyzer yet. No Template UI, server File creation cutover, Renderer field, Svelte editor behavior, or `markdown` table change is included.

## Storage and migration

- Migration: `migrations/0001_creation_template_catalog.sql`
- Catalog schema version: `1`
- Catalog key: `koala:creation-templates`
- Initial revision: `1`
- Migration behavior: creates the Catalog table and no data.
- Initialization behavior: one atomic `INSERT ... ON CONFLICT ... RETURNING` command writes or returns the Catalog row.
- A stored empty Catalog remains empty when initialization repeats.

The generated migration contains no `ALTER`, replacement, index, or data operation against `markdown`.

## Verification results

| Check | Result |
| --- | --- |
| Focused File/Template/analyzer/config/Catalog tests | Pass: 31 tests |
| Full `pnpm test` | Pass: 17 files, 133 tests |
| Changed-file ESLint | Pass |
| `pnpm exec astro check` | No new diagnostics; blocked by two existing errors in `drizzle.config.ts` and `src/pages/api/playground/compile.ts` |
| `pnpm run build:cf` | Pass |
| `pnpm run build` | Existing configuration blocker: no default SSR adapter outside Cloudflare mode |
| Full `pnpm run lint` | Existing repository baseline blocker: 553 findings; changed-file lint passes |
| Fresh Wrangler D1 migration in `/private/tmp/koalablog-gate1a-d1-v3` | Pass: `0000` and `0001` applied; Catalog table exists with zero rows before initialization |
| `pnpm run test:d1` | SQLite and D1 now register the same six Catalog contract cases; the managed sandbox still cannot start the isolated Workers runtime, and sandbox-exit approval was rejected |

The existing `markdown-parser` tests continue to emit their pre-existing incomplete-DOM-mock stderr while passing. Gate 1A does not change that production parser or its tests.

## Review resolution

The required Standards and Spec reviews were run against `main...HEAD`. Review fixes include:

- reject every File Path with a filename extension, not only `.md`/`.svelte`;
- reject fields outside the Template v1 schema, including `renderer`;
- make Catalog initialization one atomic D1/SQLite statement and keep preset data out of migrations and reads;
- add an isolated D1 contract suite and real temporary-D1 migration verification;
- remove unconditional Cloudflare references to the local filesystem store;
- replace the heterogeneous `as never` config merge with explicit typed scope merges;
- route onboarding database reset through the Drizzle-owned `src/db` layer;
- reuse the existing Source classification owner.
- route SQLite and D1 Catalog test setup through Drizzle and register one shared contract suite for both backends;
- keep the local KV store type-safe with `unknown` values and narrow custom KV reads at the string boundary.

An earlier sandbox-exit attempt reached the D1 suite and exposed an `incomplete input` failure in its direct `D1.exec` migration setup. That setup has been replaced with one migration statement executed through the Drizzle D1 adapter. The current managed environment does not permit a post-fix Workers runtime rerun, so Gate 1A retains that external verification blocker rather than claiming a D1 pass.

## Legacy Path evidence for Gate 1B

The current database convention stores relative `link` values such as `memo/foo`; the new runtime parser intentionally rejects them. Gate 1B must use its separately named legacy normalizer to prepend `/` during dry-run and migration. It must also report active Paths whose final segment contains a dot, because Gate 1A now treats every filename extension as invalid.

No production Path rows were rewritten or audited in Gate 1A. Active normalization collisions, invalid legacy rows, and independent `subject` differences remain Gate 1B stop conditions.
