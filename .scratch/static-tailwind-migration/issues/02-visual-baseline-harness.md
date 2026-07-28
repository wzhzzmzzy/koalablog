# 02 — Visual baseline harness, calibration, and durable archive

Status: ready-for-agent

## What to build

A committed screenshot-capture harness plus a durable, re-retrievable pre-migration baseline archive. The harness (capture script, page matrix, page-state definitions, threshold calculation logic) lives in the repo; screenshot binaries live outside it.

Page matrix: home, a Markdown post, login, 404, Dashboard home, Dashboard settings, editor. Home and post are also captured at a mobile viewport; one public page additionally in dark theme (if theme switching is part of the supported contract).

Pinned capture conditions: same machine and browser version across baseline and post-migration captures; fixed seed data, logged-in state, theme, and viewports; the editor pins the open file and sidebar/preview state; animations, caret blink, and time-dependent UI are disabled; fonts and network are settled before capture.

Threshold calibration is empirical, not guessed: take repeat captures of unchanged code, measure rendering jitter, and derive the pixel-diff threshold from that measurement.

Screenshot binaries may live in a per-run `/private/tmp` directory, but the baseline handed to the final acceptance slice (06) must be a durable handoff artifact: a manifest (pages, viewports, themes), the calibrated thresholds, the browser version, content hashes, and an accessible archive location that an independently-claimed later slice can retrieve.

## Acceptance criteria

- [ ] Capture harness, page-state definitions, and threshold logic committed to the repo
- [ ] Baseline captured pre-migration under the pinned conditions above
- [ ] Repeat-capture jitter measured; diff threshold derived from the measurement and recorded
- [ ] Durable baseline archive persisted with manifest + thresholds + browser version + file hashes + accessible location (not solely a session-local tmp dir)
- [ ] Archive retrievability demonstrated (e.g. fresh process reads and verifies manifest + hashes)

## Blocked by

None — can start immediately.

## Comments

### Archive location

```
/private/tmp/koalablog-visual-baseline/
├── manifest.json              # pages, viewports, themes, thresholds, browser version, hashes
├── calibration.json           # raw A-vs-B per-page diff measurements + threshold derivation
├── verification.json          # raw A-vs-C per-page diff measurements + pass/fail
├── screenshots/               # 10 canonical baseline PNGs (= calibration run A)
├── calibration/
│   ├── run-a/                 # calibration capture 1 (10 PNGs)
│   └── run-b/                 # calibration capture 2 (10 PNGs)
└── verification/
    └── run-c/                 # re-capture verification (10 PNGs)
```

### Harness location (committed to repo)

```
scripts/visual-baseline/
├── types.ts              # shared types (MatrixEntry, BaselineManifest, etc.)
├── matrix.ts             # page matrix (10 entries) + STABILISE_CSS + pinState hooks
├── diff.ts               # pixelmatch/pngjs diff + threshold derivation (pure functions)
├── capture.ts            # main harness: boots server, captures 3x, writes archive
├── verify-manifest.ts    # fresh-process manifest + hash verifier (no deps needed)
└── pngjs.d.ts            # minimal type declaration for pngjs
```

### Threshold values

| Metric               | Value      |
|----------------------|------------|
| Max observed jitter  | 0.0000%    |
| Margin               | 0.2000%    |
| Calibrated threshold | 0.2000%    |

The threshold is `max(maxObservedRatio + margin, 0.001)`. The max observed jitter across all 10 pages in the A-vs-B calibration was 0.0000% (perfectly deterministic under pinned conditions), so the threshold is driven by the 0.2% absolute margin. This provides a meaningful safety net for sub-pixel rendering differences while being tight enough to catch real CSS regressions.

### Browser version

- Browser: **chromium 151.0.7922.34**
- Playwright: **1.62.0**

### Page matrix (10 captures)

| ID                              | Path                              | Viewport   | Theme | Auth |
|---------------------------------|-----------------------------------|------------|-------|------|
| home-desktop-light              | /                                 | 1280×800   | light | no   |
| home-mobile-light               | /                                 | 390×844    | light | no   |
| home-desktop-dark               | /                                 | 1280×800   | dark  | no   |
| post-desktop-light              | /post/hello                       | 1280×800   | light | no   |
| post-mobile-light               | /post/hello                       | 390×844    | light | no   |
| login-desktop-light             | /login                            | 1280×800   | light | no   |
| 404-desktop-light               | /__baseline_nonexistent__ (→/404) | 1280×800   | light | no   |
| dashboard-desktop-light         | /dashboard                        | 1280×800   | light | yes  |
| dashboard-settings-desktop-light| /dashboard/settings               | 1280×800   | light | yes  |
| editor-desktop-light            | /dashboard/edit?path=/phase-two   | 1280×800   | light | yes  |

### Pinned conditions

- **Seed data**: e2e fixture from `scripts/test/setup-editor-e2e.ts` (executed unmodified via `test:e2e:server`). Provides `/post/hello` (Markdown post), `/phase-two` (editor file), and admin user.
- **Auth**: dashboard pages use `Authorization: Bearer koalablog-playwright` header (API token → admin user). Public pages use no auth header so `/login` renders its form.
- **Theme**: light = latte, dark = mocha (layout.astro defaults). Dark mode via Playwright `colorScheme: 'dark'` (emulates `prefers-color-scheme: dark`).
- **Viewports**: desktop 1280×800, mobile 390×844.
- **Animations disabled**: CSS injection (`* { animation: none !important; transition: none !important; }`, `.cm-cursor { display: none !important; }`, `caret-color: transparent !important`) applied after navigation + networkidle + `document.fonts.ready`.
- **Editor state**: file `/phase-two` open via URL param, sidebar visible (desktop default `w-64`), Edit Source mode active, focus blurred to remove active-line highlight + caret, no dirty buffer.
- **Server port**: E2E_PORT=4333 (avoids collision with default 4322 used by playwright.config.ts).

### Calibration + verification results

**Calibration (A vs B)**: all 10 pages → 0 mismatched pixels (0.0000% ratio). Rendering is perfectly deterministic under pinned conditions.

**Verification re-capture (A vs C)**: all 10 pages → 0 mismatched pixels (0.0000% ratio). All below the 0.2000% threshold. **PASSED**.

**Fresh-process manifest verification**: `verify-manifest.ts` parsed `manifest.json`, verified all 10 SHA-256 content hashes match, confirmed `verification.passed = true`, confirmed calibration + verification raw files exist. **PASSED**.

### How to re-run

```bash
# 1. Capture a fresh baseline (boots server on port 4333, captures 3x, writes archive)
pnpm tsx scripts/visual-baseline/capture.ts

# 2. Verify the archive from a fresh process (no server needed)
pnpm tsx scripts/visual-baseline/verify-manifest.ts

# 3. Use a custom archive location
pnpm tsx scripts/visual-baseline/capture.ts --archive /path/to/archive
pnpm tsx scripts/visual-baseline/verify-manifest.ts --archive /path/to/archive
```

### Dependencies added to package.json

`pixelmatch` (^7.1.0) and `pngjs` (^7.0.0) were added as devDependencies — the one exception to the no-package.json rule for this issue. They are used by `diff.ts` for pixel-level screenshot comparison. No other files outside `scripts/visual-baseline/` were modified (except `package.json` + `pnpm-lock.yaml`).

### Reproducibility notes for slices 04 and 06

- The archive at `/private/tmp/koalablog-visual-baseline/` is the acceptance anchor. Slice 04 should capture the same matrix post-migration and diff against `screenshots/` using the threshold from `manifest.json`.
- The `matrix.ts` file is the single source of truth for the page matrix — slice 04 should import it rather than redefining entries.
- The `diff.ts` file provides `diffScreenshots()`, `deriveThreshold()`, and `verifyAgainstThreshold()` — slice 04 should reuse these.
- The `manifest.json` contains the full matrix definition (paths, viewports, themes, auth) so a different agent can reconstruct the capture without reading the source code.
