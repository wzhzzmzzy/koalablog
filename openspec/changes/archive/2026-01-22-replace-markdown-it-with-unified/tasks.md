# Tasks: Replace Markdown-it with Unified

## Phase 1: Dependencies & Setup
- [x] Uninstall `markdown-it` and related `@mdit/*`, `markdown-it-*` packages. <!-- id: uninstall-deps -->
- [x] Install `unified`, `remark`, `rehype` core packages. <!-- id: install-core -->
- [x] Install standard plugins: `remark-gfm`, `remark-math`, `rehype-katex`, `remark-frontmatter`, `remark-directive`, `remark-wiki-link`. <!-- id: install-plugins -->
- [x] Install `@shikijs/rehype`. <!-- id: install-shiki -->

## Phase 2: Core Rendering Pipeline
- [x] Create `src/lib/markdown/processor.ts` to export the base unified processor factory. <!-- id: create-processor -->
- [x] Implement `renderIt` replacement using `unified`. <!-- id: update-render-it -->
- [x] Ensure basic markdown and GFM rendering works (tables, lists). <!-- id: verify-basic -->

## Phase 3: Feature Porting & Refactoring
- [x] Port **Meta Plugin**: Configure `remark-frontmatter` to parse YAML. **Remove** custom loose parser. <!-- id: port-meta -->
- [x] Port **Math**: Configure `remark-math` and `rehype-katex`. <!-- id: port-math -->
- [x] Port **Shiki**: Configure `@shikijs/rehype` with existing theme support (Catppuccin). <!-- id: port-shiki -->
- [x] Port **Expandable**: Implement `remark-directive` handler. **Standardize** syntax to generic directives. <!-- id: port-expandable -->
- [x] Port **Double Link**: Configure `remark-wiki-link` with a custom page resolver that uses the `allPostLinks` context. <!-- id: port-wiki-links -->
- [x] Port **Tag Plugin**: Implement custom remark plugin for inline `#tag` parsing. <!-- id: port-tags -->
- [x] Port **Todo Plugin**: Implement a `rehype` plugin that transforms standard `input[type=checkbox]` (from gfm) into custom SVG icons. **Remove** manual regex parsing. <!-- id: port-todo -->
- [x] Port **Code Block Wrapper**: Implement rehype plugin to wrap code blocks with language labels. <!-- id: port-code-wrapper -->

## Phase 4: Integration & Cleanup
- [x] Update `src/lib/markdown/index.ts` to export new API or shim existing API. <!-- id: integration -->
- [x] Verify `drizzle` types or other consumers of markdown content (if any). <!-- id: verify-consumers -->
- [x] Remove old plugin files (`double-link-plugin.ts`, `meta-plugin.ts`, `todo-plugin.ts`, `tag-plugin.ts`, `wrapperless-fence-rule.ts`). <!-- id: cleanup -->
- [x] Run tests and manual verification. <!-- id: verification -->
