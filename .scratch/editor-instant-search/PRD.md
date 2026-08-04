# Editor Instant Search

Status: ready-for-agent

## Intent

Add an Editor-local, browser-only Instant Search entry at the top of File Explorer. It must make already loaded Files easy to find by File Path, parsed Tag, or Source without adding a request, database index, or server search endpoint.

## Confirmed behaviour

- A persistent `Search Files` input sits below the File Explorer header. `Cmd/Ctrl + K` opens the sidebar when necessary and focuses that input; it prevents the browser default only on the Editor page.
- A non-empty literal query replaces the Path tree with one ranked result per active File. Clear or `Esc` restores the tree; opening a result preserves the query and result list.
- Matching is case-insensitive for case-mapped scripts and treats the entire input, including spaces, as one contiguous literal substring. Regex, token syntax, filters, and navigation-to-match are out of scope.
- Search uses each File's current Effective Source: a dirty Edit Buffer overrides its saved Path, renderer, and Source. Markdown Tags are re-analysed from that Effective Source.
- Markdown Source matching excludes one leading YAML frontmatter block. Svelte Source matching is literal over the full Source. Trashed Files never participate.
- `File Path` outranks Tag, which outranks Source. Ties use most recently updated first. A result shows all matching fields, a source snippet around the first occurrence, source match count, and the existing dirty indication.
- Scan all active Files but render at most 100 results. The first implementation targets 2,000 Files / 20 MB Source with results updated within 100 ms after an 80 ms debounce.

## Visual design

The sidebar remains a focused File operation rather than a separate page. The full-width input becomes the single focal point. Search results are a compact, sequential list using existing Catppuccin tokens: file title, muted path, small source-kind labels, optional two-line source excerpt, and clear selection/hover/dirty states. The zero-result state explains that only active Files are searched; the empty query always restores the tree.

## Implementation seams

1. `src/components/editor/instant-search.ts` is framework-free and produces ranked result view models from `FileRecord[]`, an Edit Buffer lookup, and a query.
2. `Sidebar.svelte` owns input debounce, list/tree mode, result rendering, and clear/escape behaviour.
3. `Page.svelte` exposes the input handle to the Editor-level keyboard listener and opens the sidebar before focusing it.
4. Existing server reads, API actions, schema, migration, and file lifecycle remain unchanged.

## Verification

- Unit tests prove literal matching, Path/Tag/Source priority, frontmatter exclusion, Svelte inclusion, dirty-buffer overrides, exclusion of trashed Files, result limits, snippet/count behaviour, and safe highlighting segments.
- Playwright proves desktop entry, global shortcut, tree restoration, ranking, frontmatter exclusion, Tag and Svelte Source hits, dirty Source/Path updates, result navigation/query persistence, and mobile restore behaviour.
- Run focused unit tests, focused Playwright specs, full Editor E2E, lint, and Cloudflare build.

## Future evolution

If the stated budget is exceeded, preserve the UI and result contract while moving derived, normalized search documents into a Web Worker first. Only then consider a rebuildable inverted index or server-side FTS; Markdown remains the Source of truth.
