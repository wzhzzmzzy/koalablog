# 04 — Site Stylesheet entry, font tokens, and `--at-apply` expansion

Status: ready-for-agent

## What to build

Create the Site Stylesheet as a second Tailwind entry, alongside the untouched Dashboard Stylesheet:

- Imports only `theme` and `utilities` — no preflight, mirroring the current no-reset reality
- Utilities emitted inside a named cascade layer (this is the layering half of the cascade contract)
- `@theme inline` font tokens preserving the Koala font semantics: `font-sans` / `font-serif` / `font-mono` plus `font-ui` / `font-content` / `font-code`, all referencing the Koala font variables — matching the Artifact profile's shortcuts
- `@source` covering layouts, public pages (non-recursive glob or explicit exclusion of `pages/dashboard/**` — verify which mechanism the installed Tailwind supports), and shared component directories (article-view, editor, head, memos, onboarding, playground); Dashboard-owned directories stay exclusively with the Dashboard Stylesheet
- Imported by the root Layout so every page receives it, mirroring today's global UnoCSS availability (both Dashboard layouts wrap the root Layout, so editor-under-dashboard is covered)

Expand the eight static `--at-apply` usages (seven in the global stylesheet, one in the dashboard stylesheet) to equivalent native CSS declarations, so no directive transformation remains in the static pipeline.

Static UnoCSS remains fully active during this slice: both engines temporarily emit identical declarations. That is a safe intermediate state, not the end state.

Extend the slice-01 e2e with a CSSOM probe asserting static utilities now live in the named `utilities` cascade layer. Caveat: while global UnoCSS (unlayered) still exists, the FINAL artifact-cascade mechanism is not yet proven — that proof is slice 05's acceptance, not this slice's.

## Acceptance criteria

- [ ] Site Stylesheet builds with theme+utilities only, utilities inside a named cascade layer, no preflight
- [ ] Root Layout loads it on every page including Dashboard pages; Dashboard Stylesheet and its `@source` scope untouched
- [ ] All six font utilities available statically, values referencing the Koala font variables
- [ ] All eight `--at-apply` sites expanded to plain CSS with equivalent declarations
- [ ] Pixel diff against the slice-02 baseline is green across the page matrix
- [ ] CSSOM layer probe green; slice-01 computed-style e2e still green (interim state)

## Blocked by

- 01-artifact-cascade-regression-e2e
- 02-visual-baseline-harness
- 03-engine-agnostic-class-audit

## Comments

### What was built

- **`src/styles/site.css`** (new): the Site Stylesheet. Imports `tailwindcss/theme` in `layer(theme)` and `tailwindcss/utilities` in `layer(utilities)` — no preflight, mirroring `dashboard-ui.css`. `@theme inline` block declares the six font tokens (`--font-sans`, `--font-serif`, `--font-mono`, `--font-ui`, `--font-content`, `--font-code`) referencing the runtime Koala CSS variables; `inline` makes the generated utilities resolve to `var(--koala-font-*)` directly. Six `@source` boundaries: `../layouts`, `../pages/*.astro` (non-recursive glob — see mechanism below), `../components/article-view`, `../components/editor`, `../components/head`, `../components/memos`, `../components/onboarding`.
- **`src/layouts/layout.astro`**: added `import '@/styles/site.css'` so every page (including Dashboard pages, which wrap the root Layout) loads the Site Stylesheet.
- **`astro.config.ts`**: widened the `dashboardTailwindPlugins` gate. Previously the wrapper's `transform.handler` short-circuited every CSS id except `dashboard-ui.css`; now it tests against two regexes — `dashboardTailwindEntry` and a new `siteTailwindEntry` matching `src/styles/site.css` — and lets either through. The wrapper itself is preserved (UnoCSS's virtual `__uno.css` module still exists; removal is slice 05).
- **`src/styles/global.css`**: expanded seven `--at-apply` sites to plain CSS declarations per the mapping in the issue brief. Each `--at-apply` line was removed entirely (no dead custom property left behind). Final declarations: `a { text-decoration: none }`, `nav { margin-top: 1.25rem; margin-bottom: 1.25rem }`, `nav > p > a + a { margin-left: 0.75rem }`, `blockquote { border-left-width: 1px; border-left-style: solid; margin-left: 2rem; padding-left: 1rem }`, `.code-block { overflow-x: auto; max-width: 800px; padding-left: 0.5rem; padding-right: 0.5rem; box-sizing: border-box }`, `.btn { … height: 2.5rem; width: 4.5rem; font-size: 16px }`, `input.input { … padding: 0.5rem }`.
- **`src/styles/dashboard.css`**: expanded the one `--at-apply` site (`#page button.icon`) to plain CSS: `width: 2.5rem; padding-top: 0.5rem; padding-bottom: 0.5rem; border-radius: 0.25rem; display: inline-flex; align-items: center; justify-content: center`.
- **`tests/e2e/cascade-contract.spec.ts`**: added a second test, "Site Stylesheet utilities are wrapped in a named `utilities` cascade layer (CSSOM probe)". It walks `document.styleSheets` (recursing into `CSSMediaRule`s, skipping cross-origin sheets that throw on `cssRules`), finds the `CSSLayerBlockRule` named `utilities`, and asserts `ruleCount > 0`. Resilient to dev-vs-build inlining differences (does not hard-code a rule count or a specific selector). The pre-existing slice-01 computed-style test stays green unchanged.
- **`scripts/visual-baseline/compare.ts`** (new): the compare-against-baseline harness. Boots the e2e server on `E2E_PORT=4333`, captures the full `PAGE_MATRIX` once, diffs each capture against the baseline screenshots in `/private/tmp/koalablog-visual-baseline/screenshots`, and reports PASS/FAIL against the calibrated `threshold` in `manifest.json`. Reuses `matrix.ts` + `diff.ts` + `types.ts` (slice 06 depends on these). `capture.ts`, `diff.ts`, `matrix.ts`, `types.ts`, `verify-manifest.ts` are unmodified — their public API is stable.

### `@source` mechanism verified (tailwindcss 4.3.3)

The installed `tailwindcss@4.3.3` supports **non-recursive globs** in `@source`. `@source "../pages/*.astro"` scans only the top-level `.astro` files in `src/pages/` and does **not** descend into `src/pages/dashboard/`. This was verified with a Tailwind `compile()` probe that:

1. Compiled `site.css` through Tailwind's programmatic API (with a `loadStylesheet` callback that resolves the `tailwindcss/theme` and `tailwindcss/utilities` package imports).
2. Collected every `class="..."` literal from the dashboard-only scan scope (`src/pages/dashboard/**` + `src/components/{dashboard,io,rebuild,settings,template,ui}/**`) and from the site scan scope (`src/layouts`, `src/pages`, `src/components/{article-view,editor,head,memos,onboarding}`).
3. Computed the set of dashboard-only classes (those appearing in dashboard files but in NONE of the site-scanned dirs) — **142 classes**.
4. Built the site.css utilities from the site-scan candidates and grepped the built CSS for each dashboard-only class.

**Result: 0 / 142 dashboard-only classes leaked into the site.css payload.** The `@source "../pages/*.astro"` non-recursive glob correctly excludes `src/pages/dashboard/**`. The `@source not "..."` exclusion syntax was therefore not needed.

Also verified: the built CSS contains `@layer utilities { … }` and `@layer theme { … }` blocks, no `@layer preflight`, and `.font-ui` / `.font-content` / `.font-code` utilities — when candidates are added — resolve to `var(--koala-font-sans)` / `var(--koala-font-serif)` / `var(--koala-font-mono)` respectively. (They are not currently emitted because no scanned markup uses them statically — exactly the precondition noted in the issue brief; `@theme inline` makes them *available* on demand.)

### Verification commands and results

```text
# a. astro check (pre-existing baseline must remain at 11 errors)
$ pnpm exec astro check
Result (262 files):
- 11 errors
- 0 warnings
- 11 hints
# Match: 11 errors — no new errors introduced, no pre-existing errors fixed.

# b. pnpm build (Cloudflare Pages adapter needs CF_PAGES=1)
$ CF_PAGES=1 pnpm build
20:35:04 [vite] ✓ built in 10.88s
20:35:04 [build] Server built in 22.70s
20:35:04 [build] Complete!
# PASS — no build config weakened; CF_PAGES=1 sets the Cloudflare adapter.

# c. cascade contract e2e (port 4333 — port 4322 is occupied by the user's dev server)
$ E2E_BASE_URL=http://127.0.0.1:4333 pnpm exec playwright test tests/e2e/cascade-contract.spec.ts
  ✓  1 [chromium] › tests/e2e/cascade-contract.spec.ts:104:1 › Artifact Stylesheet wins over static utilities for the shared flex class (cascade contract) (12.4s)
  ✓  2 [chromium] › tests/e2e/cascade-contract.spec.ts:196:1 › Site Stylesheet utilities are wrapped in a named `utilities` cascade layer (CSSOM probe) (798ms)
  2 passed (45.5s)
# PASS — slice-01 computed-style test still green; new CSSOM layer probe green.

# d. Pixel diff against the slice-02 baseline
$ pnpm tsx scripts/visual-baseline/compare.ts
  home-desktop-light                          0 /    1024000 px  (0.0000%)
  home-mobile-light                           0 /     329160 px  (0.0000%)
  home-desktop-dark                           0 /    1024000 px  (0.0000%)
  post-desktop-light                          0 /    1024000 px  (0.0000%)
  post-mobile-light                           0 /     329160 px  (0.0000%)
  login-desktop-light                         0 /    1024000 px  (0.0000%)
  404-desktop-light                           0 /    1024000 px  (0.0000%)
  dashboard-desktop-light                     0 /    1024000 px  (0.0000%)
  dashboard-settings-desktop-light            0 /    1024000 px  (0.0000%)
  editor-desktop-light                        0 /    1024000 px  (0.0000%)
  Comparison PASSED (threshold: 0.2000%)
# PASS — every page at 0.0000% pixel diff, well under the calibrated 0.2000% threshold.
# Confirms UnoCSS/Tailwind coexistence is visually neutral: identical declarations,
# the --at-apply expansions are pixel-equivalent, and the layered utilities do not
# change source-order rendering because the values match UnoCSS's layer-free output.
```

### Final astro check error count

**11 errors** — matches the pre-existing slice-01 baseline exactly. No new errors introduced by this slice; no pre-existing errors fixed (per the must-not-do list).

### Notes for slice 05

- The `dashboardTailwindPlugins` wrapper in `astro.config.ts` is still required during this slice — UnoCSS's virtual `__uno.css` module is still being served. Slice 05 (remove static UnoCSS) should remove the wrapper entirely, leaving the plain `tailwindcss()` plugin chain so both `site.css` and `dashboard-ui.css` go through Tailwind's standard Vite transform.
- The CSSOM probe added to `tests/e2e/cascade-contract.spec.ts` is the layering-half proof; the cascade-contract computed-style test (slice 01) is the behavior-half proof. Slice 05's acceptance is the conjunction of both, after UnoCSS removal.
- `scripts/visual-baseline/compare.ts` is the slice-06 acceptance harness; its public API (CLI flags `--archive` and `--out`, exit code 0/1) should remain stable.

