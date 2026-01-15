# Proposal: Implement ByteMD Editor (Beta)

## Summary
Create a new editor page (`dashboard/edit-beta`) that utilizes `bytemd` as the core editing component, replacing the custom implementation. This new page will feature a three-column layout consisting of a file tree, the editor, and a combined outline/preview pane.

## Motivation
The current custom editor lacks some robustness and features provided by established libraries like ByteMD. The user specifically requested a new layout and engine to improve the editing experience while maintaining control over the interface (file tree, outline).

## Scope
- **Added**:
    - New page: `src/pages/dashboard/edit-beta.astro`.
    - New components: `PageBeta.svelte`, `EditorByteMD.svelte`, `Outline.svelte` (or integrated).
    - Dependencies: `bytemd`, `@bytemd/plugin-gfm`, `@bytemd/svelte`.
- **Modified**:
    - None (Side-by-side implementation).
- **Removed**:
    - None.

## Risks
- Minimal risk as this is a new "beta" route and does not affect the existing editor.
- Potential CSS conflicts if ByteMD styles interfere with global styles (unlikely with scoped components).
