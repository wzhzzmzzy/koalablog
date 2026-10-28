# Editor workspace · Hallmark redesign

## Scope

The Editor at `/dashboard/edit` is a working application surface. The redesign retains its routes, File Path editing, File Explorer, Edit Buffer, save/conflict behavior, Markdown view modes, Svelte Preview and explicit Artifact Deploy, File lifecycle, finder, image upload, and File Reference navigation. It introduces no content lifecycle, and Source save remains separate from Svelte Artifact deployment as specified by ADR-0015.

## Visual system

The existing Catppuccin settings remain authoritative, including CodeMirror's published syntax theme. UI uses the existing Outfit face and the site's monospace face for paths and Source. Following user review, a single rounded document surface replaces the decorative gradients, texture and repeated framed regions. The explorer and surrounding canvas use Mantle; the document and popups use Base; white toolbar and status surfaces with 20% transparency (80% alpha) distinguish Latte chrome from the neutral Mantle explorer; dark palettes use their neutral Base for chrome; Source and Preview keep their neutral surfaces, with restrained rules at functional boundaries; Text and Subtext1 carry text; Mauve marks focus, selection and the primary action. Svelte's existing brand orange is a named token.

The interface uses a compact scale: 12px metadata, 14px controls, 20px file title; mobile inputs stay at least 16px. Controls use a 10px radius, dialogs 18px, and the main document shell 20px (16px on mobile). The toolbar remains fixed within the workspace's flex layout, with navigation and promoted Find action, editable File Path, view switcher and File actions. Toolbar, title, canvas and status share one rounded shell. The toolbar is 52px and the status bar 28px high on desktop; both share white chrome at 80% alpha in Latte and neutral Base chrome in Frappé, separate from the Mantle sidebar. Thin rules separate toolbar from title, title from writing area, and content from status. The 12px split control adds a single centered hairline behind its draggable handle. The explorer remains unframed. Source and Preview remain one editing region, without extra inset padding or nested frames. Preview padding is 20px by 24px on desktop and 12px by 16px on mobile, with tighter heading and paragraph rhythm. Source uses a 14px font and 1.6 line height; the existing coarse-pointer 16px rule remains authoritative. The Source/Preview separator uses the existing persisted ratio and a 12px width consistent with its view model, without allowing the preview's intrinsic size to shrink Source.

Menu, finder, path input, File lifecycle dialogs, dependency review, conflict block, uploads, notification and reference peek use the same semantic palette. Portaled dialogs inherit the editor variables through a body selector scoped to the presence of the workspace. Focus appears immediately, duplicate finder rings are removed, disabled controls preserve their native state, and reduced-motion applies to overlays too. Touch targets expand under a coarse pointer.

## Preview behavior

Markdown Source, Split and Preview retain the current view model, including small-screen split fallback. Svelte retains its separate full-canvas Preview and Edit Source return action. A status message covers the initial period without an Artifact; existing build errors remain alerts.

The shared Markdown renderer now passes fences outside its loaded language set to Shiki's plaintext path. An unknown language must not blank the surrounding editor preview; the code still appears escaped, and surrounding prose still renders. Regression coverage includes Svelte and an unknown language, checking the displayed code and absence of an executable script element.

## Verification

Hallmark's app scope applies: no marketing hero, section rhythm, invented imagery, or screen word budget. The source inventory protects every prior link, field, handler and test hook. Screenshots and run logs stay under ignored `.hallmark/`, and are local test data only. The prototype honors the configured palette; the Frappé example uses a separate local test configuration, without changing the user's system appearance or production settings.

This document describes the implemented editor-specific system, not a design lock on other Dashboard pages.

Validation of the final change: the Cloudflare production build passed; 730 unit tests passed and 1 skipped; ESLint reports 0 errors and 2 existing unused-disable warnings in generated worker types. `astro check` reports 22 errors in five test files that are byte-identical to the base commit: `api/llms.spec.ts`, `api/rss.spec.ts`, `api/sync-attachment-auth.spec.ts`, `components/file-list.spec.ts`, and `svelte/page-runtime.spec.ts` (all under `src/tests/`). This does not represent a clean repository-wide type check.

Manual localhost checks covered Markdown Source/Split/Preview, file finder, path validation, lifecycle confirmation cancellation, Svelte client preview and return, 1440px desktop and 375/390px mobile viewports, and Latte/Frappé palettes. Final Latte toolbar and status backgrounds read `rgba(255,255,255,0.8)` with element opacity still 1. No production content was used, and the Playwright E2E suite was not run. Captures, test configuration and logs remain in ignored local directories.
