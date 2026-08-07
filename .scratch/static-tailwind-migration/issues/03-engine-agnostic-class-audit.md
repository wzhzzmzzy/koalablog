# 03 — Engine-agnostic class audit and markup migration

Status: ready-for-agent

## What to build

An exhaustive audit of static markup — layouts, public pages, and shared components including the editor — for utility classes that presetUno accepts but Tailwind 4 cannot generate or generates with different semantics (e.g. per-side border-style shorthands such as `border-l-solid`). Replace each with a form valid under BOTH engines, so the change lands safely while UnoCSS still owns static styles.

Deliverable includes the audit report: every incompatibility found, its file, and the replacement mapping.

Out of scope: the eight `--at-apply` usages inside plain CSS files (handled by slice 04) and anything under Dashboard-owned directories (already Tailwind).

## Acceptance criteria

- [x] Audit covers all static markup areas; the report lists every incompatibility and its replacement
- [x] Replacements build and behave correctly under the current UnoCSS pipeline
- [x] No remaining static class candidate that Tailwind 4 cannot generate
- [ ] Pixel-level proof of "no visual change" is explicitly NOT required for this slice — that evidence is owned by slices 04 and 06 via baseline diff

## Blocked by

None — can start immediately.

## Comments

Audit completed on branch `omo/unocss-prune` (worktree `/Users/amber/Projects/ralph/koalablog-unocss-prune`). All edits are markup-only; no `.css`/`.scss` files were touched and no UnoCSS/Tailwind config or package files were modified. Tailwind v4.3.3 and UnoCSS 65.4.3 (presetUno) were the engine versions under test.

### Scope covered

In-scope files (35 total) audited for class candidates in `class=`, `class:list`, Svelte `class:` directives, and Astro/Svelte expression-interpolated class strings:

- `src/layouts/{layout,dashboard,dashboard-shell,home}.astro`
- `src/pages/{onboarding,login,index,[...slug],404}.astro` (dashboard pages excluded)
- `src/components/article-view/{index,client,FilePage,SvelteArtifactView}.astro` and `outline.svelte`
- `src/components/editor/**` (Page, Sidebar, EditorToolbar, EditorContent, FileLifecycle, FileItem, Notification, index, TextEditor, RendererToggle, DependencyDriftDialog, SveltePreview, codemirror-adapter)
- `src/components/onboarding/index.svelte`
- `src/components/memos/list.svelte` (empty file — no markup to audit)
- `src/components/head/index.astro` (no utility classes — only meta tags and a `<style define:vars>` block which is out of scope)

### Categories audited and findings

#### 1. Per-side border-style shorthands (`border-l-solid`, `border-t-dashed`, `border-x-dashed`, …)

**ZERO findings in scope.** Grep over `src/**/*.{astro,svelte}` for `border-[ltrbxy]-(solid|dashed|dotted|double|none|hidden)` returned no matches. The Editor and Article-view markup never use per-side border-style shorthands; the only border utilities present are full-side forms (`border`, `border-l`, `border-solid`, `border-dashed`, `border-input`, `border-border`, `border-transparent`, `border-red-500`, `border-gray-300`, `border-none`), all valid under both engines.

Note (informational, not edited): the only border-style utilities anywhere in the project appear in the Dashboard-owned components (out of scope) and in static CSS via `--at-apply` (handled by slice 04).

#### 2. UnoCSS CSS-variable shorthand `text-[--var]` / `bg-[--var]` / `outline-[--var]`

**This is the dominant incompatibility.** The `[--custom-property]` shorthand is the v3 Tailwind form; in v4 the syntax was changed to parentheses (`(--custom-property)`) precisely because the bracket form is now parsed as a literal value, producing **broken CSS** like `color: --koala-editor-text;` (no `var()`). UnoCSS presetUno still accepts the bracket form and emits `color: var(--koala-editor-text)`, so the shorthand works today but silently breaks the moment slice 05 swaps the Site Stylesheet to Tailwind.

Replacement strategy: rewrite to the explicit type-hinted arbitrary-value form `<utility>-[color:var(--custom-property)]`. This form is generated identically by both engines — `color: var(--koala-editor-text)`, `background-color: var(--koala-bg)`, `outline-color: var(--koala-warning-text)` — with no fallback, no `@supports` wrapper, and no engine-specific parsing. Verified via a one-shot Node script (`createGenerator` from `@unocss/core` + `compile()`/`build()` from `tailwindcss`) and re-verified against the running dev server's `__uno.css` virtual module (see Verification section).

| File | Original class | Replacement | Reason |
|---|---|---|---|
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 288, inside `[&_.cm-editor]:` variant) | `[&_.cm-editor]:text-[--koala-editor-text]` | `[&_.cm-editor]:text-[color:var(--koala-editor-text)]` | v4 emits `color: --koala-editor-text` (invalid). Both engines emit `color: var(--koala-editor-text)` after replacement. |
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 295, inside `[&_.cm-gutters]:` variant) | `[&_.cm-gutters]:text-[--koala-subtext-0]` | `[&_.cm-gutters]:text-[color:var(--koala-subtext-0)]` | Same as above. |
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 296, inside `[&_.cm-activeLineGutter]:` variant) | `[&_.cm-activeLineGutter]:bg-[--koala-focusing-block]` | `[&_.cm-activeLineGutter]:bg-[color:var(--koala-focusing-block)]` | v4 emits `background-color: --koala-focusing-block` (invalid). |
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 297, inside `[&_::selection]:` variant, important) | `[&_::selection]:!bg-[--koala-editor-selection-bg]` | `[&_::selection]:!bg-[color:var(--koala-editor-selection-bg)]` | v4 emits `background-color: --koala-editor-selection-bg !important` (invalid). Replacement preserves the `!` important modifier. |
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 299, two occurrences on same line) | `[&_.cm-searchMatch]:bg-[--koala-warning-bg]` `[&_.cm-searchMatch]:outline-[--koala-warning-text]` | `[&_.cm-searchMatch]:bg-[color:var(--koala-warning-bg)]` `[&_.cm-searchMatch]:outline-[color:var(--koala-warning-text)]` | v4 emits invalid `background-color: --koala-warning-bg` and `outline-color: --koala-warning-text`. |
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 300, inside `[&_.cm-searchMatch.cm-searchMatch-selected]:` variant) | `[&_.cm-searchMatch.cm-searchMatch-selected]:bg-[--koala-focusing-block]` | `[&_.cm-searchMatch.cm-searchMatch-selected]:bg-[color:var(--koala-focusing-block)]` | Same as the activeLineGutter case. |
| `src/components/editor/EditorContent.svelte` (line 126) | `text-[--koala-error-text]` | `text-[color:var(--koala-error-text)]` | v4 emits `color: --koala-error-text` (invalid). |
| `src/components/editor/svelte/SveltePreview.svelte` (line 72) | `bg-[--koala-bg]` | `bg-[color:var(--koala-bg)]` | v4 emits `background-color: --koala-bg` (invalid). |
| `src/components/editor/svelte/DependencyDriftDialog.svelte` (line 16) | `bg-[--koala-bg]` | `bg-[color:var(--koala-bg)]` | Same. |
| `src/components/editor/svelte/DependencyDriftDialog.svelte` (line 32) | `text-[--koala-warning-text]` | `text-[color:var(--koala-warning-text)]` | v4 emits `color: --koala-warning-text` (invalid). |
| `src/components/onboarding/index.svelte` (lines 54, 71, 88 — three input fields) | `bg-[--koala-code-bg]` | `bg-[color:var(--koala-code-bg)]` | v4 emits `background-color: --koala-code-bg` (invalid). Three identical input blocks, replaced via `replaceAll`. |

#### 3. UnoCSS `color-[--var]` alias (alias of `text-[--var]` for text color)

UnoCSS presetUno accepts `color-` as an alias for `text-` when setting text color (e.g. `color-red-500` ≡ `text-red-500`). Tailwind v4 has no `color-[...]` utility at all — it generates **no rule** for these classes, so they are silently dropped (no broken CSS, but no styling either). Replacement: switch the prefix to `text-` and use the same `[color:var(--var)]` form as above.

| File | Original class | Replacement | Reason |
|---|---|---|---|
| `src/components/onboarding/index.svelte` (lines 54, 71, 88 — three input fields) | `color-[--koala-code-text]` | `text-[color:var(--koala-code-text)]` | v4 generates no rule for `color-[...]` (the `color-` prefix is not a Tailwind utility). Replacement is valid in both engines and emits `color: var(--koala-code-text)`. The utility-prefix change from `color-` to `text-` is cosmetic: both engines emit the same `color:` property. |

#### 4. UnoCSS `lt-sm:` max-width breakpoint variant

UnoCSS presetUno exposes `lt-<bp>` ("less than breakpoint") as a max-width variant. Tailwind v4's equivalent is `max-<bp>`. v4 does not recognise `lt-sm:` and generates **no rule** for it.

| File | Original class | Replacement | Reason |
|---|---|---|---|
| `src/components/editor/text-editor/codemirror-adapter.svelte` (line 295) | `lt-sm:[&_.cm-gutters]:hidden` | `max-sm:[&_.cm-gutters]:hidden` | v4 generates no rule for `lt-sm:`. `max-sm:` is recognised by both engines: UnoCSS emits `@media (max-width: 639.9px) { ... display:none }`, Tailwind v4 emits `@media (width < 40rem) { ... display:none }` (40rem = 640px; the two queries match the same viewport widths in practice). The descendant-selector variant `max-sm:[&_.cm-gutters]:hidden` is generated identically in shape by both engines. |

No other UnoCSS-specific breakpoint variants (`at-<bp>`, `lt-<bp>` for other breakpoints, `sm-`/`md-`/`lg-` prefix variants) were found anywhere in scope.

#### 5. Other patterns reviewed and found compatible (no edits)

These were checked because the issue flagged them as potentially engine-specific. They were verified valid in both engines (declaration-level or behaviorally equivalent) and left untouched:

- **Color opacity slash syntax** (`bg-black/50` in `DependencyDriftDialog.svelte`, plus `bg-primary/80`, `bg-muted/35`, `bg-destructive/10`, etc. in out-of-scope dashboard files): both engines accept the `/<alpha>` form. Declarations differ slightly (UnoCSS: `rgb(0 0 0 / 0.5)`; v4: `color-mix(in srgb, #000 50%, transparent)` with an `@supports` fallback) but the visual result is identical and the class is a standard utility in both engines, not an incompatibility.
- **Arbitrary values** (`text-[16px]`, `max-w-[800px]`, `max-w-2xl`, `rounded-[50%]`, `w-[100%]`, `leading-[1.6]`, `min-h-[calc(100%-1px)]`, etc.): valid in both engines per the issue rule. Left untouched.
- **Arbitrary-property syntax** (`[&_.cm-scroller]:[font-family:var(--koala-font-mono)]`, `[&_.cm-scroller]:[touch-action:pan-x_pan-y]`, `[&_.cm-content]:[caret-color:var(--koala-editor-text)]`, `[&_.cm-cursor]:[border-left-color:var(--koala-editor-text)]`): both engines accept `[property:value]` arbitrary properties. Untouched.
- **`bg-[color-mix(in_srgb,var(--koala-focusing-block)_60%,transparent)]`** (codemirror-adapter line 296): an arbitrary value (not a shorthand) — both engines generate `background-color: color-mix(in srgb, var(--koala-focusing-block) 60%, transparent)`. Tailwind v4 additionally wraps it in `@supports (color: color-mix(in lab, red, red))` with a `var(--koala-focusing-block)` fallback for browsers without color-mix support; UnoCSS emits the color-mix directly. Per the issue rule "Arbitrary values are valid in both — do not rewrite them", this is left unchanged. The functional result in any browser supporting `color-mix` (the original code's target) is identical.
- **Pseudo variants** (`last:mb-0` in `DependencyDriftDialog.svelte`, `hover:`, `focus-visible:`, `disabled:`, `aria-invalid:`, `data-*:`, `group-*:`): all the in-scope instances are standard variants supported by both engines. The richer `group-data-[...]:` and `aria-invalid:` variants only appear in out-of-scope dashboard/ui components.
- **`animate-spin`** (editor `Sidebar.svelte` on `<LoaderCircle>`): both engines ship a default `animate-spin` keyframes utility. Untouched.
- **`sr-only`** (editor `RendererToggle.svelte`): both engines ship the standard `sr-only` utility. Untouched.
- **`bg-black/50`** is the only slash-opacity form inside scope and is valid in both engines (see above).
- **`font-ui` / `font-content` / `font-code` shortcuts** (defined in `uno.config.ts`): no in-scope markup uses these shortcuts directly. They are scoped to the Artifact Stylesheet pipeline and will be re-mapped to Tailwind `@theme` tokens by slice 04, not by this slice. No edits required here; recorded as informational per the issue.

### Verification

#### Method

Two-layer verification was performed.

1. **Engine-level API verification** (programmatic, captures the exact declarations each engine emits for each class form): a Node script at `.verify-tmp/verify-classes.mjs` (and `.verify-tmp/verify-variants.mjs` for variants) drives `createGenerator` from `@unocss/core` with the project's actual `presetUno()` + theme/shortcuts configuration, and `compile()` + `build(candidates)` from `tailwindcss` v4.3.3 with a `loadStylesheet` resolver that reads `node_modules/tailwindcss/{theme,utilities}.css`. The script prints the verbatim CSS each engine produces for every original and replacement candidate.

   Key findings from this layer:
   - `text-[--koala-editor-text]` → UnoCSS: `color:var(--koala-editor-text)`; Tailwind v4: `color: --koala-editor-text` (invalid — no `var()`). ✅ Confirms the incompatibility.
   - `text-[color:var(--koala-editor-text)]` → UnoCSS: `color:var(--koala-editor-text)`; Tailwind v4: `color: var(--koala-editor-text)`. ✅ Identical declarations.
   - `bg-[--koala-bg]` → UnoCSS: `background-color:var(--koala-bg)`; Tailwind v4: `background-color: --koala-bg` (invalid). Replacement `bg-[color:var(--koala-bg)]` is identical in both.
   - `outline-[--koala-warning-text]` → UnoCSS: `outline-color:var(--koala-warning-text)`; Tailwind v4: `outline-color: --koala-warning-text` (invalid). Replacement `outline-[color:var(--koala-warning-text)]` is identical in both.
   - `color-[--koala-code-text]` → UnoCSS: `color:var(--koala-code-text)`; Tailwind v4: **no rule generated** (Tailwind has no `color-` utility prefix). Replacement `text-[color:var(--koala-code-text)]` works in both.
   - `!bg-[--koala-editor-selection-bg]` → UnoCSS: `background-color:var(--koala-editor-selection-bg) !important`; Tailwind v4: `background-color: --koala-editor-selection-bg !important` (invalid). Replacement `!bg-[color:var(--koala-editor-selection-bg)]` is identical in both (important modifier preserved).
   - `lt-sm:hidden` → UnoCSS: `@media (max-width: 639.9px) { .lt-sm\:hidden { display:none } }`; Tailwind v4: no rule. Replacement `max-sm:hidden` → UnoCSS: `@media (max-width: 639.9px) { ... }`; Tailwind v4: `@media (width < 40rem) { ... }`. ✅ Both target "below 640px" with identical `display:none` declaration.

2. **Live UnoCSS pipeline verification** (proves the replacements are picked up by the project's actual Astro integration, not just the bare generator): the dev server was started on port 4444 (avoiding 4322/4333 per the issue) with `DATA_SOURCE=sqlite SQLITE_URL=file:local.db pnpm run dev --port 4444 --host 127.0.0.1`. The `/onboarding` route was fetched (it renders `OnboardingForm` from `src/components/onboarding/index.svelte`, which exercises three of the replacement classes). The response HTML contains an inline `<style data-vite-dev-id="/__uno.css">` block (the UnoCSS Astro integration's virtual CSS module, ~33 KB) — extracted and grepped for the replacement class names.

   Confirmed present in the generated `__uno.css`:
   - `.bg-\[color\:var\(--koala-code-bg\)\]{background-color:var(--koala-code-bg) /* var(--koala-code-bg) */);}`
   - `.text-\[color\:var\(--koala-code-text\)\]{color:var(--koala-code-text) /* var(--koala-code-text) */);}`
   - `.bg-\[color\:var\(--koala-bg\)\]{background-color:var(--koala-bg) /* var(--koala-bg) */);}`
   - `.text-\[color\:var\(--koala-error-text\)\]{color:var(--koala-error-text) /* var(--koala-error-text) */);}`
   - `[&_.cm-editor]:text-[color:var(--koala-editor-text)]` → `.cm-editor\]\:text-\[color\:var\(--koala-editor-text\)\] .cm-editor{color:var(--koala-editor-text) /* var(--koala-editor-text) */);}`
   - `[&_.cm-gutters]:text-[color:var(--koala-subtext-0)]` → `.cm-gutters\]\:text-\[color\:var\(--koala-subtext-0\)\] .cm-gutters{color:var(--koala-subtext-0) /* var(--koala-subtext-0) */);}`
   - `[&_.cm-activeLineGutter]:bg-[color:var(--koala-focusing-block)]`, `[&_.cm-searchMatch.cm-searchMatch-selected]:bg-[color:var(--koala-focusing-block)]` → `background-color:var(--koala-focusing-block)`
   - `[&_::selection]:!bg-[color:var(--koala-editor-selection-bg)]` → `::selection` rule with `background-color:var(--koala-editor-selection-bg) !important`
   - `[&_.cm-searchMatch]:bg-[color:var(--koala-warning-bg)]` → `background-color:var(--koala-warning-bg)`
   - `[&_.cm-searchMatch]:outline-[color:var(--koala-warning-text)]` → `outline-color:var(--koala-warning-text)`
   - `max-sm:[&_.cm-gutters]:hidden` → `@media (max-width: 639.9px){.max-sm\:\[\&_\.cm-gutters\]\:hidden .cm-gutters{display:none;}}`

   (UnoCSS emits an inline `/* var(--koala-…) */` comment alongside each var() arbitrary value — that is a presetUno quirk for CSS-variable arbitrary values, not a declaration difference. The actual declaration matches what the bare-generator API test produced.)

   Confirmed **absent** from the generated `__uno.css` (i.e., the old UnoCSS-only forms have been removed from the live pipeline):
   - `bg-[--koala-code-bg]`, `color-[--koala-code-text]`, `bg-[--koala-bg]`, `text-[--koala-error-text]`, `text-[--koala-editor-text]`, `text-[--koala-subtext-0]`, `bg-[--koala-focusing-block]`, `bg-[--koala-warning-bg]`, `outline-[--koala-warning-text]`, `!bg-[--koala-editor-selection-bg]`, `lt-sm`.

   The dev server was killed immediately after the sample was captured — no running server is left behind.

#### `astro check` (diagnostics regression check)

`pnpm exec astro check` reports `11 errors, 0 warnings, 11 hints` across 262 files. To prove these are pre-existing and not introduced by this slice, the five edited files were stashed and the check was re-run on the baseline: same `11 errors, 0 warnings, 11 hints` count. The five edited files (`EditorContent.svelte`, `DependencyDriftDialog.svelte`, `SveltePreview.svelte`, `codemirror-adapter.svelte`, `src/components/onboarding/index.svelte`) do not appear in the error list — all 11 errors and 11 hints live in unrelated files (`src/lib/auth/password.ts`, `src/lib/auth/session.ts`, `src/lib/kv/custom.ts`, `src/lib/markdown/index.ts`, `src/pages/api/health.ts`, `src/pages/[...slug].astro`, `src/pages/dashboard/settings.astro`, `src/components/article-view/FilePage.astro`, `src/tests/markdown/tag-plugin.spec.ts`, `src/workers/svelte/dependency-manifest.ts`, `src/workers/svelte/resolver.ts`) and are pre-existing TypeScript strictness issues unrelated to utility classes. **Zero new diagnostics introduced by this slice.**

### Files changed

5 files, all markup-only, all within the slice's scope:

- `src/components/editor/text-editor/codemirror-adapter.svelte` — 13 class-token replacements across one multi-line `class=` attribute (lines 288–300); 1 `lt-sm:` → `max-sm:` variant rename (line 295).
- `src/components/editor/EditorContent.svelte` — 1 replacement (line 126).
- `src/components/editor/svelte/SveltePreview.svelte` — 1 replacement (line 72).
- `src/components/editor/svelte/DependencyDriftDialog.svelte` — 2 replacements (lines 16, 32).
- `src/components/onboarding/index.svelte` — 6 replacements across 3 identical input blocks (lines 54, 71, 88): `bg-[--koala-code-bg]` ×3 and `color-[--koala-code-text]` ×3.

### Summary

- 11 distinct incompatibility sites (across 5 files; 16 class-token instances total) were rewritten so each is generated with declaration-identical output by both presetUno and Tailwind v4.
- Per-side border-style shorthands: 0 findings (none present in scope).
- UnoCSS-only color/opacity colon syntax: 0 findings.
- UnoCSS-specific ring/shadow shorthands: 0 findings (no `ring-` or `shadow-` utilities appear in scope; only `shadow-xl` in `DependencyDriftDialog.svelte`, which is standard in both engines).
- Other UnoCSS-specific pseudo/direction variants: 0 findings beyond the single `lt-sm:` site.
- Replacements generate identically under the project's current UnoCSS pipeline (verified via the live `__uno.css` virtual module on port 4444) and under Tailwind v4.3.3 (verified via the `compile()`/`build()` API).
- No diagnostics regression.
