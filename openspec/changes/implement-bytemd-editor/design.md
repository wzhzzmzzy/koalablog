# Design: ByteMD Editor (Beta)

## Architecture

### Components
1.  **`src/pages/dashboard/edit-beta.astro`**
    -   Serves as the route entry point.
    -   Loads initial data (markdown files) similar to `edit.astro`.
    -   Mounts `PageBeta.svelte`.

2.  **`src/components/editor/PageBeta.svelte`**
    -   Implements the 3-column layout.
    -   **Left Column**: `Sidebar.svelte` (Existing).
    -   **Center Column**: `EditorByteMD.svelte` (New wrapper).
    -   **Right Column**: `RightPanel.svelte` (New).
    -   Manages global editor state (current file, content) using `store.svelte.ts`.

3.  **`src/components/editor/EditorByteMD.svelte`**
    -   Wraps `bytemd`.
    -   Handles content changes and updates the store.
    -   Configured to show only the editor pane (no split preview).
    -   Plugins: `@bytemd/plugin-gfm`.

4.  **`src/components/editor/RightPanel.svelte`**
    -   Tabs for "Outline" and "Preview".
    -   **Preview Tab**: Uses `bytemd/Viewer` (or `Viewer` from `@bytemd/svelte`) to render content.
    -   **Outline Tab**: Parses markdown headers to display a table of contents.

### State Management
-   Reuses `src/components/editor/store.svelte.ts` for managing the list of files and the currently active file.
-   The editor content will be synced with `editorStore.currentMarkdown`.

### Dependencies
-   `bytemd`
-   `@bytemd/svelte`
-   `@bytemd/plugin-gfm`

## User Interface
-   **Layout**: Flexbox/Grid container.
    -   Left: Fixed/Resizable (default ~250px).
    -   Center: Flex-grow.
    -   Right: Fixed/Resizable (default ~300px).
-   **Theme**: Matches existing dark/light mode (using CSS variables).

## Constraints
-   No "Attachment upload" (per request).
-   No "Tag" support (per request).
-   No "Double link" support (per request).
-   Editor only needs basic markdown capabilities.
