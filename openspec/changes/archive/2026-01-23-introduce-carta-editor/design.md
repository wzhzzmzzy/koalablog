# Design: Carta Editor Integration

## Architecture

The integration follows a "Parallel Strategy" where both editors coexist but only one is active at a time.

### Component Hierarchy

```mermaid
graph TD
    Page[Page.svelte] --> Sidebar[Sidebar.svelte]
    Page --> Switcher{Editor Toggle}
    Switcher -->|Legacy| OldEditor[index.svelte (Textarea)]
    Switcher -->|Modern| NewEditor[CartaEditor.svelte]

    NewEditor --> TopBar[Toolbar / Header]
    NewEditor --> Carta[Carta Instance]
```

### State Management

*   **Global App State** (`store.svelte.ts`): Continues to hold the "Source of Truth" for the document list (`items`) and the currently selected document (`currentMarkdown`).
*   **Carta Local State** (`carta-store.svelte.ts`):
    *   Manages the `carta` instance.
    *   Handles editor-specific configuration.
    *   Tracks transient editor state (cursor, history) independent of the global app history.

### Data Flow

1.  **Initialization**: `Page.svelte` passes the `currentMarkdown` object to the active editor component.
2.  **Editing**:
    *   **Textarea**: Updates local state `textareaValue`.
    *   **Carta**: Updates Carta's internal store.
3.  **Saving**:
    *   Both editors expose an `onSave` event or method.
    *   `Page.svelte` (or a unified wrapper) handles the actual API call to save the data to the backend, ensuring consistent behavior regardless of the editor used.

### Persistence
*   The user's choice of editor is saved in the global `pageConfig` (field: `editor`).
*   This is synchronized via `GlobalConfig` in KV/Storage, allowing the preference to persist across devices/sessions.
*   **Fallback**: If no config is present, default to "Legacy" (or "Carta" if strictly configured).

## Key Components

### 1. `CartaEditor.svelte`
*   **Layout**:
    *   **Header**: Contains Title input, Path/Link input, Save button, Editor Toggle button, and other file operations (Upload, Delete, Private toggle).
    *   **Body**: The `Carta` component.
*   **Props**: `markdown` (initial data), `onSave` (callback).

### 2. `carta-store.svelte.ts`
*   Encapsulates logic to initialize Carta with necessary plugins (Slash, Emoji, Code, etc.).
*   Provides reactive access to the editor content.

### 3. `Page.svelte` (Modifications)
*   Import both editors.
*   Read preference from `GlobalConfig` (passed via props or store).
*   Render conditionally.

### 4. `Settings` (Modifications)
*   Add a UI control (dropdown or radio) to select the default editor.
