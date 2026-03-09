# Design: Unified Pipeline Architecture

## Architecture Overview

The rendering pipeline will shift from a single-pass token stream (Markdown-it) to a multi-phase AST transformation (Unified):

1.  **Parse**: Markdown Text -> mdast (Markdown AST) via `remark-parse`.
2.  **Transform (Markdown)**: mdast -> mdast via `remark` plugins.
    *   Handle Wiki Links, Tags, Containers, GFM, Math, Frontmatter.
3.  **Bridge**: mdast -> hast (HTML AST) via `remark-rehype`.
4.  **Transform (HTML)**: hast -> hast via `rehype` plugins.
    *   Handle Shiki highlighting, Math rendering (Katex), sanitize (if needed).
5.  **Stringify**: hast -> HTML String via `rehype-stringify`.

## Feature Mapping

| Feature | Current (Markdown-it) | New (Unified/Remark/Rehype) | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Base Markdown** | `markdown-it` | `remark-parse` + `remark-gfm` | Standard CommonMark + GFM support. |
| **Frontmatter** | `meta-plugin.ts` (Custom, Loose) | `remark-frontmatter` (Standard YAML) | **Refactor**: Abandon custom parser. Use standard YAML parsing (via `js-yaml` implicitly by `remark-frontmatter`). This standardizes metadata format. |
| **Task Lists** | `todo-plugin.ts` (Custom Regex + SVG injection) | `remark-gfm` + Rehype Transform | **Refactor**: Use standard `remark-gfm` to parse task lists into standard inputs. Use a custom `rehype` plugin to visit these inputs and replace them with the design-specific SVGs. Separates parsing from styling. |
| **Expandable** | `markdown-it-container` (Regex) | `remark-directive` | **Refactor**: Adopt `remark-directive` standard syntax (`::: expandable`). Transforms container directives into `<details>`/`<summary>`. |
| **Math** | `@mdit/plugin-katex` | `remark-math` + `rehype-katex` | Standard math support. |
| **Code Highlighting** | `@shikijs/markdown-it` | `@shikijs/rehype` | Use `@shikijs/rehype` for code blocks. |
| **Wiki Links** | `double-link-plugin.ts` | `remark-wiki-link` | **Refactor**: Prefer using the community `remark-wiki-link` plugin configured with a custom page resolver to match `allPostLinks`, rather than maintaining a custom regex parser. |
| **Tags** | `tag-plugin.ts` (`#tag`) | Custom Remark Plugin | Custom regex visitor for `#tag`. This remains custom as it's non-standard markdown, but implementation will be cleaner on AST. |
| **Code Fences** | Custom wrapper | Custom Rehype Plugin | Wrap `<pre><code>` with the required `<div class="code-block">...</div>` structure in the HTML AST phase. |

## Plugin Implementation Details

### Refactor: Frontmatter
- **Current**: Custom parser handling strings, bools, and "json-like" arrays.
- **New**: Standard YAML.
- **Impact**: Existing markdown files with "loose" syntax (if any) might need update, but it's worth it for standard compliance.

### Refactor: Task Lists (Separation of Concerns)
- **Phase 1 (Remark)**: `remark-gfm` turns `-[ ]` into a list item with a `checked` property.
- **Phase 2 (Rehype)**: A custom rehype plugin visits `input[type="checkbox"]`.
- **Action**: Replace the standard input element with the custom SVG icons defined in the project.
- **Benefit**: The markdown parser doesn't need to know about SVGs.

### Refactor: Directives (Expandable)
- Use `remark-directive`.
- Syntax:
  ```markdown
  :::expandable{title="Click me"}
  Content
  :::
  ```
  Or (if supporting "leaf" shorthand):
  ```markdown
  :::expandable[Click me]
  Content
  :::
  ```
- Transformer: Maps `expandable` directive to `<details>` tag.

### Custom Tag Plugin
- Visit `text` nodes.
- Regex match `/(^|\s)#[a-zA-Z0-9]+(\s|$)/`.
- Replace match with a custom mdast node (e.g., `type: 'tag', value: 'name'`).
- Handle in rehype or remark-rehype to render as `<span>`.

### Wiki Link Resolution
- Use `remark-wiki-link`.
- Configure `hrefTemplate` or `pageResolver` to look up the slug from the passed `allPostLinks` context.

## TypeScript & API Changes
- Export `createProcessor(options)` instead of `md()` instance.
- The `renderIt` function will instantiate the unified processor and run `.process()`.
- Return type changes: `vfile` result contains both content and metadata (frontmatter).

## Dependencies
- `unified`
- `remark-parse`, `remark-rehype`, `rehype-stringify`
- `remark-gfm`, `remark-math`, `rehype-katex`
- `remark-frontmatter`
- `remark-directive`
- `@shikijs/rehype`
- `unist-util-visit` (for custom plugins)
