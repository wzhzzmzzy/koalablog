# Replace Markdown-it with Unified (Remark + Rehype)

## Summary
Replace the current `markdown-it` based rendering pipeline with `unified` ecosystem (`remark` for Markdown AST and `rehype` for HTML AST). This change aims to improve extensibility, leverage a more modern and active ecosystem, and prepare for future migration to Carta.

## Motivation
- **Ecosystem**: `markdown-it` ecosystem is aging. `unified` (remark/rehype) has a vibrant ecosystem with better TypeScript support.
- **Extensibility**: `unified` uses AST (Abstract Syntax Tree) transformations, making it easier to write robust plugins compared to `markdown-it`'s token stream.
- **Future Proofing**: The user mentioned a desire to migrate to Carta in the future, which likely aligns better with `unified` or requires a more structured AST approach.
- **Maintainability**: Stronger typing and decoupled parsing/rendering phases.

## Scope
- Remove `markdown-it` and associated plugins.
- Introduce `unified`, `remark`, `rehype` dependencies.
- Re-implement existing markdown features using the new stack:
  - GFM (tables, etc.)
  - Math (Katex)
  - Code highlighting (Shiki)
  - Custom containers (`::: expandable`)
  - Wiki links (`[[Link]]`)
  - Inline tags (`#tag`)
  - Task lists (`[ ]`, `[x]`) with custom icons
  - Frontmatter metadata parsing
- Update `src/lib/markdown/index.ts` and `src/lib/markdown/render-it.ts` to use the new pipeline.
