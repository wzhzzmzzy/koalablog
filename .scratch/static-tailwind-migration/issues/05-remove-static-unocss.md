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
