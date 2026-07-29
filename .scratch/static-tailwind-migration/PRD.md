# PRD: Static UnoCSS → Tailwind migration

## Goal

Remove UnoCSS from Astro's static stylesheet pipeline to end the dual-engine maintenance burden (including the Tailwind Vite plugin workaround in `astro.config.ts`), while retaining UnoCSS unchanged inside the Svelte Artifact Worker.

## Spec and vocabulary

- Decision record: [ADR 0013 (status: proposed)](../../docs/adr/0013-use-tailwind-for-static-styles-retain-unocss-for-artifacts.md)
- Glossary (`CONTEXT.md`): **Site Stylesheet** / **Dashboard Stylesheet** / **Artifact Stylesheet** — use these terms in all issues
- Original handoff with acceptance criteria: `/private/tmp/koalablog-static-tailwind-migration-handoff-2026-07-28.md`
- Artifact-side trust model: [ADR 0009](../../docs/adr/0009-generate-unocss-during-artifact-builds.md)

## Hard constraints

- No global preflight from static Tailwind anywhere (current static pipeline has no reset either — preserve that).
- The Artifact seam is frozen: Worker pipeline, `unocssVersion` / `unocssConfigHash` contracts, and stored Artifacts are untouched.
- The Artifact Stylesheet must win over static utilities for any common class name, by intentional layering (static utilities in a named cascade layer; Artifact Stylesheet layer-free).
- Root scoping constrains only generated utilities; trusted component CSS may escape the Artifact Root under the existing trust model — unchanged.
- Worker dependencies stay: `@unocss/core`, `@unocss/preset-uno`, `@unocss/transformer-directives`, `magic-string`, and the dev `optimizeDeps` entries.

## Issues and dependency graph

```text
01 ─┐
02 ─┼─> 04 ─> 05 ─> 06
03 ─┘         (06 also requires the durable baseline archive delivered by 02)
```

1. **01-artifact-cascade-regression-e2e** — behavior guard, written first, green pre- and post-migration
2. **02-visual-baseline-harness** — committed capture harness + calibrated thresholds + durable baseline archive
3. **03-engine-agnostic-class-audit** — markup compatibility preprocessing
4. **04-site-stylesheet-entry** — Site Stylesheet entry, font tokens, `--at-apply` expansion (UnoCSS coexists)
5. **05-remove-static-unocss** — integration/config/package removal; final cascade mechanism takes effect here
6. **06-visual-acceptance** — full matrix diff review and ADR flip to `accepted`
