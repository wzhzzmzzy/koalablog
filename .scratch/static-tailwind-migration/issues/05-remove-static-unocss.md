# 05 — Remove static UnoCSS

Status: ready-for-agent

## What to build

Remove UnoCSS from Astro's static pipeline end to end:

- Drop the `UnoCss()` Astro integration
- Delete the Tailwind Vite plugin wrapper workaround — with UnoCSS's virtual stylesheet gone, the plain `tailwindcss()` plugin is used directly
- Delete the static `uno.config.ts` (the Worker never reads it)
- Uninstall the static-only packages: `unocss`, `@unocss/preset-icons`, `@unocss/preset-rem-to-px`
- Keep the Worker runtime dependencies (`@unocss/core`, `@unocss/preset-uno`, `@unocss/transformer-directives`, `magic-string`) and the dev `optimizeDeps` entries untouched — the toolchain registry script reads versions from `@unocss/core` and `@unocss/preset-uno`, both retained
- Sweep docs and agent notes for stale references to static UnoCSS

This is the slice where the final cascade mechanism takes effect: static utilities are now exclusively Tailwind's layered output, and the layer-free Artifact Stylesheet must provably win.

## Acceptance criteria

- [ ] `astro.config.ts` registers no UnoCSS integration; the Tailwind Vite plugin has no wrapper
- [ ] `uno.config.ts` deleted; the three static-only packages removed; Worker deps and `optimizeDeps` intact
- [ ] `pnpm build:cf` passes
- [ ] Worker unit/E2E contracts pass unchanged in meaning: no Uno generator during diagnose; Worker build emits root-scoped Uno CSS; public/Markdown routes do not fetch the Worker toolchain — `src/tests/svelte/unocss.spec.ts` passes unmodified
- [ ] Slice-01 public-page computed-style e2e still green — the final layered/unlayered cascade is now actually proven
- [ ] Pixel diff against the slice-02 baseline is green

## Blocked by

- 04-site-stylesheet-entry

## Comments

### What was removed

- **astro.config.ts**: Deleted `import UnoCss from 'unocss/astro'`, the entire `dashboardTailwindPlugins` wrapper (including `dashboardTailwindEntry` and `siteTailwindEntry` regex constants and the JSDoc comment), and `UnoCss()` from the `integrations` array. Replaced `plugins: [...dashboardTailwindPlugins, PreprocessorDirectives()]` with `plugins: [tailwindcss(), PreprocessorDirectives()]`. Everything else untouched (PreprocessorDirectives, optimizeDeps with `@unocss/core` + `@unocss/preset-uno` + `svelte/compiler`, build options, worker format, assetsInlineLimit, sourcemap).
- **uno.config.ts**: Deleted entirely (20 lines — the static UnoCSS config the Worker never reads).
- **Packages removed** (`pnpm remove`): `unocss`, `@unocss/preset-icons`, `@unocss/preset-rem-to-px` — all from devDependencies.
- **Packages KEPT untouched**: `@unocss/core` (65.4.3), `@unocss/preset-uno` (65.4.3), `@unocss/transformer-directives` (65.4.3) in dependencies; `magic-string` (0.30.17) in dependencies. All confirmed still installed at correct versions in node_modules.
- **src/styles/site.css**: Updated header comment — replaced the stale "Static UnoCSS remains active during the migration coexistence period (slice 04) … UnoCSS removal is slice 05" with "This is the sole static utility engine: Tailwind 4 generates every static utility class from this entry. UnoCSS is retained only inside the Svelte Artifact Worker and never participates in the static build."
- **Stale-comment sweep**: Grepped all `*.{ts,css,astro,svelte,js,mjs}` files for `unocss|UnoCSS|uno.config|coexistence|slice 0[45]|remains active|both engines|dual.engine|static.*uno|uno.*static`. The only stale comments were in astro.config.ts (deleted with the wrapper) and site.css (updated). All remaining UnoCSS references in source code are Worker-related (src/workers/**, src/lib/svelte/**, DB contracts, test files) — left untouched as instructed. No changes to docs, .scratch, or ADRs.

### Safety grep (pre-removal)

Before deleting anything, grepped for `unocss/astro`, `from 'unocss'`, `from '@unocss/preset-icons'`, `from '@unocss/preset-rem-to-px'`, and `uno.config` across the entire repo. All references confined to:
- `astro.config.ts` (the file being edited)
- `uno.config.ts` (the file being deleted)
- `pnpm-lock.yaml` (auto-updated by `pnpm remove`)
- `docs/adr/0013-*.md` (historical record, not touched)

No other source files referenced the removed packages or config. Safe to proceed.

### Verification results

| Check | Command | Result |
|-------|---------|--------|
| Lockfile consistency | `pnpm install --frozen-lockfile` | exit 0 |
| Kept packages | `ls node_modules/@unocss/` | core, preset-uno, transformer-directives all at 65.4.3 |
| Toolchain registry | `pnpm run svelte:toolchain:check` | exit 0 (no stale versions) |
| astro check | `pnpm exec astro check` | **7 errors** (down from 11 baseline — the 4 wrapper typing errors are gone; all 7 remaining are pre-existing in untouched files: auth/password.ts, settings.astro×2, FilePage.astro, dependency-manifest.ts, resolver.ts, render-artifact.ts) |
| Build | `CF_PAGES=1 pnpm build` | exit 0 |
| Cascade e2e | `E2E_BASE_URL=http://127.0.0.1:4333 pnpm exec playwright test tests/e2e/cascade-contract.spec.ts` | **2/2 passed** — Artifact Stylesheet wins over static utilities (cascade contract); Site Stylesheet utilities in named `utilities` layer (CSSOM probe). Final mechanism proven. |
| Svelte-toolchain e2e | `E2E_BASE_URL=http://127.0.0.1:4333 pnpm exec playwright test tests/e2e/svelte-toolchain.spec.ts` | **4/4 passed** — same-origin toolchain, no UnoCSS generator during diagnose, root-scoped UnoCSS on build, no remote fetches on public routes |
| Vitest svelte | `pnpm exec vitest run src/tests/svelte` | **76/76 passed** (17 files). `src/tests/svelte/unocss.spec.ts` UNMODIFIED (git diff clean) — 3 tests passed |
| Visual baseline | `E2E_PORT=4333 pnpm exec tsx scripts/visual-baseline/compare.ts` | **7/10 under 0.2% threshold; 3 above** (see below) |
| ESLint | `pnpm exec eslint astro.config.ts src/styles/site.css` | 0 errors |

### Visual baseline — 3 above-threshold pages investigated

| Page | Diff % | Root cause |
|------|--------|------------|
| login-desktop-light | 0.3021% | `.btn { font-size: 16px }` in `global.css` (unlayered) now wins over Tailwind's `text-sm` (layered `@layer utilities`). Verified: computed `font-size` on `#login-btn` is 16px, not 14px. Before: UnoCSS's unlayered `text-sm` won by source order. |
| dashboard-desktop-light | 1.2834% | Same cascade layer change — multiple unlayered CSS sources (`global.css`, `catppuccin.scss` body styles, `dashboard.css`) now win over Tailwind's layered utilities for conflicting properties. |
| dashboard-settings-desktop-light | 1.4333% | Same pattern; more elements affected (settings page has denser UI). |

**7 pages under threshold**: home-desktop-light (0.0015%), home-mobile-light (0.0046%), home-desktop-dark (0.0014%), post-desktop-light (0.0014%), post-mobile-light (0.0043%), 404-desktop-light (0.0000%), editor-desktop-light (0.0724%).

**Root cause**: UnoCSS generated unlayered utilities (higher cascade priority — won over other unlayered CSS by source order). Tailwind generates utilities in a named `@layer utilities` (lower priority than unlayered CSS). Removing UnoCSS means unlayered CSS (`global.css`'s `.btn { font-size: 16px }`, `catppuccin.scss` theme mixins, `dashboard.css` button styles) now wins over Tailwind's layered utilities for any conflicting property. This is the **intended consequence** of ADR 0013's design: "Utilities are emitted inside a named cascade layer so the layer-free Artifact Stylesheet always wins for any shared class name." The same mechanism that lets the Artifact Stylesheet (unlayered) win over static utilities (layered) also lets other unlayered CSS win.

**Not caused by**: missing utilities (all classes are generated by Tailwind — verified by build success and cascade e2e), incorrect class migration (slice 03 was thorough — all classes are engine-agnostic), missing icons (no UnoCSS `i-*` icon classes used anywhere in source), or `@unocss/preset-rem-to-px` (was in devDependencies but never imported in `uno.config.ts` — unused dependency).

**Possible fixes (out of scope for this slice)**: Move conflicting unlayered CSS (e.g., `global.css`'s `.btn`) into a cascade layer with lower priority than `utilities`; or use `!`-prefixed utilities (`!text-sm`) where override is needed; or recalibrate the threshold (slice 06's job). These would require modifying `global.css` or dashboard-owned files, which are explicitly out of scope.

### Final astro check error count: 7

### Verdict log (orchestrator review, 2026-07-29)

The 3 above-threshold pages were investigated to root cause with a computed-style A/B experiment (baseline reproduced via `git stash`, every element's computed style dumped and diffed, not guessed from screenshots). The agent's "cascade layer change" hypothesis was confirmed and sharpened into four distinct collision surfaces, then fixed per ADR 0013's layered design (Option A: rank hand-written base styles below Tailwind utilities, never the reverse).

**Mechanism A — unlayered base styles beat layered utilities (fixed):**

| Surface | Fix | Evidence |
|---|---|---|
| `global.css` plain rules (`.btn font-size`, `nav` margins) beating `text-sm`/`mt-10` | All non-`:root` rules wrapped in `@layer base`; layer order pinned with `@layer base, theme, utilities;` at file top | login button 14px restored |
| `dashboard-ui.css` `:where()` resets (p margins, control fonts) beating `mb-5`/`text-sm` | Only the `:where()` reset groups wrapped in `@layer base`; frame rules (`#page:has`, `.dashboard-shell`, `p line-height`) deliberately kept unlayered — they are designed to override utilities, and an over-broad wrap caused a measurable layout regression (shell padding 0→20px) that was caught and reverted | dashboard margins/fonts restored |
| CodeMirror runtime-injected base theme beating `[&_.cm-*]` arbitrary variants | Variants moved out of the class attribute to plain CSS at the end of `editor-workspace.css` under a `.cm-adapter` marker (unlayered, specificity-equal to the UnoCSS-era rules, and after the file's existing `!important` rules so baseline outcomes hold) | editor line-height/gutters/fonts restored |
| `login.astro` `!w-full` (v3-style important prefix, invalid in v4; slice-03 audit miss) | 3× `!w-full` → `w-full!` | no visual delta (form is shrink-wrapped), syntax now valid |

**Mechanism B — UnoCSS's default radius scale was shadowing the Dashboard theme (accepted, not fixed):** `rounded-lg` 8px→12px, `rounded-xl` 12px→16px on Dashboard elements. `dashboard-ui.css`'s own `@theme` defines these values; the pre-migration pixels were the interference artifact, the post-migration pixels are the design intent. Recorded here as the accepted visual change.

**Verification after fixes (all re-run by the orchestrator):**

| Check | Result |
|---|---|
| Computed-style A/B vs baseline dump | Public pages / login / editor: **0 element diffs**; dashboard pages: **only mechanism-B borderRadius** (6 + 51 elements) |
| `pnpm exec astro check` | 7 errors (unchanged, all pre-existing) |
| cascade-contract e2e (4333) | 2/2 passed |
| editor + editor-mobile e2e (4333) | **26/26 passed** |
| `compare.ts` pixel diff vs original baseline | **PASSED, all 10 pages under 0.2%** (dashboard home 0.0000%, settings 0.0146% — radius changes are sub-visible AA pixels; no baseline refresh needed) |
| eslint on changed files | 0 errors |

Also hardened `cascade-contract.spec.ts` warm-up into a bounded retry (Vite HMR full reloads were racing Playwright navigations on cold dev-server cache — caused intermittent ERR_ABORTED in this slice's first runs, reproduced and fixed).

Sub-threshold note: home/post pages show a stable 14–15px (≤0.0046%) raster delta with zero computed-style diffs — classified as sub-visible rasterization noise, documented for slice 06.

The computed-style probe and baseline dump are archived at `/private/tmp/koalablog-visual-baseline/computed-dump.mjs` and `computed-baseline.json` for slice 06 reuse.
