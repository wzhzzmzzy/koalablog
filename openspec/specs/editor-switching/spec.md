# editor-switching Specification

## Purpose
TBD - created by archiving change introduce-carta-editor. Update Purpose after archive.
## Requirements
### Requirement: Editor Toggle Mechanism
The system SHALL allow users to switch between the legacy textarea editor and the new Carta editor, persisting their preference.

#### Scenario: Toggling Editor Mode
*   **Given** the user is on the editor page
*   **When** they click the "Switch Editor" button (icon/toggle)
*   **Then** the UI should switch between the "Legacy" (Textarea) and "Modern" (Carta) views.
*   **And** the current content (including unsaved changes) should be preserved and transferred to the other editor.

#### Scenario: Persisting Preference via Global Config
*   **Given** the user has selected a preferred editor mode
*   **When** they reload the page or return later
*   **Then** the system should check the `pageConfig.editor` setting in the Global Config.
*   **And** it should render the editor matching that preference.

#### Scenario: Configuration in Settings
*   **Given** the user is on the Settings dashboard page
*   **Then** there should be a configuration option to select the default editor (Legacy vs. Modern).
*   **And** changing this option should update the `pageConfig` and be reflected in future editor sessions.

#### Scenario: Mobile Fallback (Optional)
*   **Given** the user is on a mobile device
*   **When** the page loads
*   **Then** the system MAY enforce a specific editor (e.g., Legacy) if Carta is not mobile-optimized (To be determined, assuming neutral for now).

