# 01 — Artifact cascade regression e2e

Status: ready-for-agent

## What to build

A Playwright e2e that locks the cascade contract between the Artifact Stylesheet and statically generated utilities. It must be green on the current UnoCSS-based static pipeline (where the Artifact Stylesheet wins via source order) and is required to stay green through the migration (where it must win via cascade layers). It guards behavior, not mechanism.

Fixture: a Svelte File whose markup uses a utility class that the root Layout also uses (e.g. `flex` — the layout body carries it, so the static engine always emits it), and whose component style overrides that same class through a controlled, **equal-specificity** `:global(.flex)` rule (e.g. `display: grid`). The test visits the file's public page and asserts the probe element's computed `display` is `grid` — proving the Artifact Stylesheet wins for a common class name.

Do NOT use a plain locally-scoped class for the override: Svelte's scope class would inflate specificity and make the test green even if the layering design is broken. The override's specificity must equal the static utility's.

The fixture intentionally triggers the existing non-blocking global-style diagnostic for unanchored global selectors. Assert that diagnostic surfaces as expected rather than letting it pass unnoticed.

## Acceptance criteria

- [ ] Test is green on current main (pre-migration)
- [ ] The override rule's specificity equals the static utility's (verified in the test or fixture construction — no Svelte scope-class inflation)
- [ ] The expected global-style diagnostic is asserted explicitly
- [ ] Failure output distinguishes "static utility beat Artifact Stylesheet" from unrelated causes (e.g. artifact failed to mount, fixture page 404)
- [ ] Existing Worker unit/E2E contracts are not modified

## Blocked by

None — can start immediately.

## Comments

### What was built

A new Playwright e2e spec at `tests/e2e/cascade-contract.spec.ts` containing a single test — "Artifact Stylesheet wins over static utilities for the shared flex class (cascade contract)". It locks the cascade BEHAVIOR (computed `display: grid` on a `.flex` probe) across both eras, without depending on the underlying mechanism (source order today, cascade layers post-migration).

### How the fixture is created

The fixture is fully self-contained in the spec — `scripts/test/setup-editor-e2e.ts` was not touched.

1. **Probe source**: a Svelte file whose markup carries `class="flex"` (the root layout body at `src/layouts/layout.astro` also uses `flex`, so the static UnoCSS engine always emits `.flex`), with a component `<style>` override `:global(.flex) { display: grid; }`. The override uses `:global(...)` deliberately so Svelte attaches no scope class — the compiled selector is a plain `.flex` with specificity (0,1,0), exactly equal to the static `.flex` utility. A plain locally-scoped class is forbidden because Svelte's scope class would inflate specificity to (0,2,0) and mask a broken cascade.

2. **Build + diagnostic assertion**: the spec navigates to `/dashboard/edit?path=/phase-two`, warms up the same-origin Worker toolchain with a trivial build (the first Worker creation in a dev-server session can trigger a Vite HMR navigation; the warm-up absorbs it), then builds the probe source via `buildSvelteSourceInBrowser`. The build result is asserted for `type: 'build-success'` and for the `global_style_escape` warning (the unanchored `:global(.flex)` selector intentionally trips this non-blocking diagnostic). The built CSS is also structurally verified: it contains the root-scoped UnoCSS utility `:where([data-koala-artifact-root]) .flex` (specificity 0,1,0 — `:where()` contributes 0), a plain `.flex { display: grid }` override (equal specificity, no `.svelte-` scope inflation), and the override appears after the utility in source order (`generateUnoCss` joins generated UnoCSS before the transformed component CSS).

3. **DB seeding**: the spec opens the e2e SQLite database at `.playwright/local.db` (same file the dev server reads), inserts a `markdown` row for `/cascade-probe` (`renderer: 'svelte'`, `sourceHash` from `calculateSourceHash`) and a `markdownRender` row carrying the **real built** `css`/`javascript` from the Worker (plus a hand-crafted `snapshotHtml` that matches the probe markup), with hashes from `calculateArtifactHashes`. This uses the same pattern as `scripts/test/editor-e2e-fixture.ts` but is scoped to the spec only.

4. **Public page assertion (no-JS snapshot)**: the spec visits `/cascade-probe` in a `javaScriptEnabled: false` context. It asserts the response is 200, the `[data-koala-artifact-root]` is visible with `data-koala-render-state="snapshot"` (the SEO Snapshot renders without JS, so the computed-style check depends only on the stylesheet cascade — static Site Stylesheet inlined in `<head>` + Artifact Stylesheet `<link>` in `<body>` — never on a successful artifact mount). It then asserts the probe element `[data-cascade-probe]` is visible with text "Cascade probe", and finally that `getComputedStyle(probe).display === 'grid'`. Failure messages distinguish "static utility beat Artifact Stylesheet" from "page 404 / artifact unavailable / fixture wrong" via the precondition assertions.

### Verification

Command (run in the worktree at `/Users/amber/Projects/ralph/koalablog-unocss-prune`, branch `omo/unocss-prune`):

```
pnpm exec playwright test tests/e2e/cascade-contract.spec.ts --project=chromium
```

Result:

```
Running 1 test using 1 worker

  ✓  1 [chromium] › tests/e2e/cascade-contract.spec.ts:104:1 › Artifact Stylesheet wins over static utilities for the shared flex class (cascade contract) (7.9s)

  1 passed (1.1m)
```

The Playwright `webServer` boots the dev server on `E2E_PORT=4322` (default) and tears it down after the run — `lsof -ti :4322` confirmed no running server was left behind. `lsp_diagnostics` on the new spec file returned no errors or warnings.
