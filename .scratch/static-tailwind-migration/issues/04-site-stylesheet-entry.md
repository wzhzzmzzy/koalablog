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
