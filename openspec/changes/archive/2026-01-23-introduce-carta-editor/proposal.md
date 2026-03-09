# Proposal: Introduce Carta MD Editor

We propose integrating `carta-md` as a modern, rich-text-capable markdown editor alternative to the existing raw textarea editor. This addition aims to enhance the writing experience with features like immediate preview, easier formatting, and plugin support, while keeping the existing editor available as a fallback or preference.

## Motivation
The current textarea-based editor is functional but lacks modern editing conveniences (e.g., WYSIWYG feel, instant rendering feedback during typing without a separate preview pane). `carta-md` offers a robust Svelte-native solution that fits our tech stack.

## Scope
*   **New Component**: `CartaEditor` component implementing `carta-md`.
*   **State Management**: Dedicated `carta-store` for the new editor's state.
*   **Switching Mechanism**: UI and logic to toggle between the old and new editors, persisting the choice.
*   **Isolation**: The new editor will be loosely coupled with the existing `Page` and `Sidebar` components.

## Risks
*   **Bundle Size**: Adding a new editor library might increase initial load time.
*   **Feature Parity**: Ensuring all current custom features (image upload, double-link processing) work in Carta might require custom plugins/adapters.
