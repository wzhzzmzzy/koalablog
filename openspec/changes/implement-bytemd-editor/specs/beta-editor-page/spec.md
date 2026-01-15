# Spec: Beta Editor Page

## ADDED Requirements

### Requirement: New Route `dashboard/edit-beta`
The application MUST serve a new editor page at `/dashboard/edit-beta` that mimics the data loading of the existing editor.
#### Scenario: Accessing `/dashboard/edit-beta`
    - GIVEN the user navigates to `/dashboard/edit-beta`
    - THEN the beta editor page is rendered
    - AND it loads the existing markdown files into the store.

### Requirement: Three-Column Layout
The beta editor page MUST display a three-column layout: File Tree (Left), Editor (Center), and Tools (Right).
#### Scenario: Viewing the layout
    - GIVEN the user is on the beta editor page
    - THEN they see a left sidebar with the file tree
    - AND a central area with the markdown editor
    - AND a right sidebar with Outline/Preview tabs.

### Requirement: ByteMD Editor Integration
The central editor MUST use the `bytemd` library for markdown editing.
#### Scenario: Editing content
    - GIVEN the user types in the central editor
    - THEN the content is updated in the local state
    - AND the editor provides basic markdown syntax highlighting/toolbar.

### Requirement: Excluded Features
The beta editor MUST NOT include specific features from the main editor: Attachments, Tags, and Double Links.
#### Scenario: Checking for excluded features
    - GIVEN the user uses the beta editor
    - THEN there are no buttons or options for file uploads (attachments)
    - AND there is no interface for managing Tags
    - AND there is no support for Double Links (e.g., `[[link]]` auto-complete).

### Requirement: Right Sidebar (Preview/Outline)
The right sidebar MUST provide a Preview of the markdown and an Outline view.
#### Scenario: Switching between Preview and Outline
    - GIVEN the right sidebar is visible
    - WHEN the user selects "Preview"
    - THEN the rendered markdown is shown
    - WHEN the user selects "Outline"
    - THEN a table of contents based on headers is shown.
