# 06 — Full visual acceptance and close-out

Status: ready-for-agent

## What to build

Final acceptance for the static migration. Retrieve the durable baseline archive delivered by slice 02 (manifest, calibrated thresholds, browser version, content hashes — verify them), re-capture the full page matrix post-migration under the same pinned conditions, and diff against the baseline.

Every above-threshold difference gets a verdict: explained-and-accepted (with the reason recorded) or fixed. Coverage explicitly includes the mobile viewports and the dark-theme public page. No unexplained pixel change ships.

On pass, flip ADR 0013 from `proposed` to `accepted`.

## Acceptance criteria

- [ ] Baseline archive retrieved independently; manifest, thresholds, and hashes verified before diffing
- [ ] Full matrix re-captured under the pinned conditions (desktop + mobile viewports, dark-theme coverage)
- [ ] No unexplained pixel differences remain
- [ ] Handoff acceptance criteria 1–6 all satisfied (static build free of UnoCSS integration and wrapper; visual/responsive parity incl. font semantics; no global preflight; artifact cascade contract proven with regression coverage; Worker contracts unchanged in meaning; `pnpm build:cf` + focused tests + browser checks pass)
- [ ] ADR 0013 status flipped to `accepted`; this slice's verdict log appended under `## Comments`

## Blocked by

- 05-remove-static-unocss
- Requires the durable baseline archive from 02-visual-baseline-harness

## Comments

### Verdict log (orchestrator, 2026-07-29) — ACCEPTED

**Baseline archive**: retrieved independently via `verify-manifest.ts` — all 10 page hashes match, calibration + verification files OK. Browser chromium 151.0.7922.34, calibrated threshold 0.2%.

**Full-matrix diff** (`compare.ts`, formal final run): **PASSED** — all 10 pages under threshold. Residual deltas: mechanism-B radii on dashboard-settings (149px, 0.0146%, accepted in slice 05 verdict log as the Dashboard theme's intended values) and a stable 14–15px (≤0.0046%) sub-visible raster delta on home/post pages with zero computed-style diffs (documented noise). Dark theme and mobile viewports covered and green.

**Full-flow click-through QA** (`final-qa.mjs`, archived next to the baseline): **12/12 steps passed** with per-step screenshots in `/private/tmp/koalablog-final-qa/` — public home → post navigation → 404 → login form submission → dashboard redirect; dashboard home → sidebar settings navigation → theme flavor selection (latte→frappe) → save → applied to page shell; editor open file → edit → dirty indicator → Save File → Saved Success; `/svelte-public` artifact page mounts (render-state=mounted); mobile 390px home.

**Handoff acceptance criteria**:

1. Static build free of UnoCSS integration + `__uno.css` workaround — YES: `astro.config.ts` uses plain `tailwindcss()`; `uno.config.ts` deleted.
2. Visual/responsive parity incl. Koala font semantics — YES: pixel diff green, computed-style A/B clean (0 diffs outside accepted mechanism-B), font aliases preserved as `@theme inline` tokens.
3. No global Tailwind preflight — YES: both entries import theme+utilities only.
4. Artifact cascade contract with regression coverage — YES: `cascade-contract.spec.ts` 2/2 (computed-style contract + CSSOM `utilities`-layer probe), stable on cold and warm Vite caches after warm-up hardening.
5. Worker unit/E2E contracts unchanged in meaning — YES: `vitest run src/tests/svelte` 76/76 with `unocss.spec.ts` unmodified; `svelte-toolchain.spec.ts` 4/4.
6. `pnpm build:cf` + focused tests + visual checks pass; unrelated workspace files preserved — YES: build exit 0; astro check 7 pre-existing errors unchanged; the original checkout and its unrelated dirty files were never touched.

**ADR 0013 status flipped to `accepted`.** Migration complete.
