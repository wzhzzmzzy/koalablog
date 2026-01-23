# markdown-processing Specification

## Purpose
TBD - created by archiving change replace-markdown-it-with-unified. Update Purpose after archive.
## Requirements
### Requirement: Use Unified Ecosystem
The markdown rendering engine MUST use `unified`, `remark`, and `rehype` instead of `markdown-it`.

#### Scenario: Basic Rendering
- **WHEN** rendering markdown content
- **THEN** `unified` processor is used instead of `markdown-it`

### Requirement: GFM Support
The renderer MUST support GitHub Flavored Markdown (GFM), including tables, task lists, and strikethrough.

#### Scenario: Tables
- **WHEN** rendering a markdown table
- **THEN** it renders as an HTML `<table>` element

#### Scenario: Strikethrough
- **WHEN** rendering `~~text~~`
- **THEN** it renders as `<del>text</del>`

### Requirement: Math Support
The renderer MUST support LaTeX math equations using `$` for inline and `$$` for block equations, rendered via KaTeX.

#### Scenario: Inline Math
- **WHEN** rendering `$E=mc^2$`
- **THEN** it renders using KaTeX inline mode

#### Scenario: Block Math
- **WHEN** rendering `$$` block
- **THEN** it renders using KaTeX display mode

### Requirement: Frontmatter Parsing
The renderer MUST parse YAML-style frontmatter using standard YAML syntax (via `remark-frontmatter`).

#### Scenario: Standard YAML
- **WHEN** a file starts with `---` delimiters containing standard YAML (e.g., `title: Hello`)
- **THEN** it MUST be parsed correctly into `meta` object

#### Scenario: Loose Syntax Deprecation
- **WHEN** a file contains non-standard loose syntax invalid in YAML
- **THEN** parsing MAY fail or behave differently than the old loose parser

### Requirement: Custom Task List Icons (Separation of Concerns)
The renderer MUST use `remark-gfm` for parsing task lists and a separate `rehype` transformer for styling.

#### Scenario: Markdown Parsing
- **WHEN** rendering `-[ ] Item`
- **THEN** it is parsed as a standard GFM checklist item in the markdown AST

#### Scenario: Unchecked Icon
- **WHEN** rendering to HTML
- **THEN** the standard unchecked input is replaced by the custom SVG icon

#### Scenario: Checked Icon
- **WHEN** rendering to HTML
- **THEN** the standard checked input is replaced by the custom checked SVG icon

### Requirement: Expandable Details (Standard Directives)
The renderer MUST use `remark-directive` syntax for expandable containers.

#### Scenario: Standard Syntax
- **WHEN** rendering `:::expandable{title="Title"}` (or compatible syntax)
- **THEN** it renders as `<details><summary>Title</summary>...</details>`

### Requirement: Custom Task List Icons
The renderer MUST render task lists `[ ]` and `[x]` using the custom SVG icons defined in the project design, not default browser checkboxes.

#### Scenario: Unchecked Item
- **WHEN** rendering `-[ ] Item`
- **THEN** it renders the unchecked SVG icon

#### Scenario: Checked Item
- **WHEN** rendering `-[x] Item`
- **THEN** it renders the checked SVG icon

