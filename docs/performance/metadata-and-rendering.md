# Metadata reads and Markdown rendering

## Read boundaries

- `GET /api/markdown/batch` selects only the metadata in its existing response. Markdown Files return `not_applicable` without a Deployment Summary query. Svelte Files still report the current deployment state.
- `GET /api/sync/manifest` selects only File identity, Path, Renderer Mode, Source Hash, revision and update time. Owner filtering, ordering and the complete Attachment listing are unchanged.
- Deployment Summary reads select lifecycle/Owner fields and hashes, not Source, JavaScript, CSS, snapshots or dependency JSON. Inaccessible and Markdown Files do not require an Artifact query.
- Source reads and Content Exchange still load content. Save responses still return canonical Source, and Save/Deploy keep their existing permission and optimistic concurrency checks.

These changes require no schema or data migration and do not change API response contracts. They reduce selected bytes and redundant queries, not the number of Files returned by a manifest.

## Rendering boundaries

Each `md()` and `rawMd()` call owns its Markdown parser, File Reference visibility and frontmatter state. Reusing a raw parser resets its collected code languages on every render. TeX and metadata options cannot be inherited from a previous caller.

Only the expensive Shiki highlighter is shared within a JavaScript runtime. Its initialization and subsequent resource loads share a Promise chain, so concurrent cold requests do not create duplicate highlighters or load the same resources twice. A failed load allows a later request to retry. Loaded resources are limited to the existing language imports and four Catppuccin themes; File Paths, Source and rendered HTML are never global cache keys or values.

Browser language selection remains on demand; later calls can add languages or themes without replacing earlier parsers' rendering options. SSR keeps the existing supported language set. This is not a cross-isolate cache and does not remove long-article browser re-rendering or all cold-start work.

## Regression checks

```sh
KOALA_PREVIEW_INTEGRATION=1 pnpm exec vitest run
pnpm run test:d1
pnpm run test:e2e
pnpm run build:cf
```

Metadata contracts run against SQLite and D1 with large Source/Artifact fixtures. Projection checks ensure body fields are excluded; API and persistence tests cover permissions, lifecycle, hashes and revision conflicts. Rendering tests use the real highlighter to cover concurrent initialization, later browser languages/themes, retry and per-parser state isolation.

Production CPU time and peak memory still require deployment-specific profiling; local test duration or reduced SQL payload is not a measurement of Worker CPU usage.
