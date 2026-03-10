# carta-integration Specification

## Purpose
TBD - created by archiving change introduce-carta-editor. Update Purpose after archive.
## Requirements
### Requirement: Carta Editor Component
The system SHALL provide a new editor component based on `carta-md` that includes a custom header and manages its own state.

#### Scenario: Rendering the Carta Editor
*   **Given** the user has selected the "Modern" (Carta) editor mode
*   **When** the editor loads a markdown file
*   **Then** the `Carta` component should be displayed instead of the textarea.
*   **And** the content of the markdown file should be populated in the editor.

#### Scenario: Header Operations
*   **Given** the Carta editor is active
*   **Then** a dedicated header bar should be visible at the top.
*   **And** it should contain an input for the **Title** (Subject).
*   **And** it should contain an input for the **Link** (Path).
*   **And** it should contain a **Save** button that triggers the save operation.

#### Scenario: State Isolation
*   **Given** the Carta editor is active
*   **Then** its internal state (undo/redo stack) should be managed by Carta's internal mechanism or `carta-store`.
*   **And** it should NOT interfere with the `textarea` editor's state if switched back and forth (though content sync is required on switch).

### Requirement: Rich Text Features
The Carta editor SHALL support rich text interactions including image handling.

#### Scenario: Image Upload
*   **Given** the user is editing in Carta
*   **When** they paste an image or drop an image file
*   **Then** the image should be uploaded (using existing upload logic).
*   **And** a markdown image link should be inserted at the cursor position.

### Requirement: Loading Feedback
The system SHALL provide visual feedback for asynchronous operations to prevent user uncertainty.

#### Scenario: Save Loading Indicator
*   **Given** the user clicks the Save button (or triggers autosave)
*   **Then** the Save button or UI should display a loading spinner or "Saving..." state.
*   **And** it should remain in this state until the server response is received.
*   **And** it should return to the normal state (or show "Saved") upon success.

#### Scenario: Upload Loading Indicator
*   **Given** an image is being uploaded (via paste or drop)
*   **Then** a placeholder or loading indicator should be visible in the editor or toolbar.
*   **And** it should be replaced by the final image link once the upload completes.

