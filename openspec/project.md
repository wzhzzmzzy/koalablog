# Project Context

## Purpose
**KoalaBlog** is a modern, dual-mode personal blogging and knowledge management system. It provides a unified content creation experience for standard blog posts, static pages, and "Memos" (micro-blogging). Key goals include:
- **Flexibility**: Run seamlessly on **Cloudflare Pages (Serverless)** with D1 or as a **Standalone Docker container** with SQLite.
- **Unified Editing**: A powerful markdown editor supporting bidirectional links (`[[link]]`), file management, and instant previews.
- **Performance**: Built on Astro 5 for fast static/hybrid rendering.
- **Aesthetics**: Polished UI with UnoCSS/Tailwind and built-in Catppuccin theming.

## Tech Stack
- **Core Framework**: [Astro 5](https://astro.build)
- **UI Components**: [Svelte 5](https://svelte.dev) (using Runes: `$state`, `$props`)
- **Database**: [Drizzle ORM](https://orm.drizzle.team)
  - Supports **Cloudflare D1** (`@cloudflare/workers-types`)
  - Supports **SQLite/LibSQL** (`@libsql/client`)
- **Styling**:
  - **UnoCSS** (Utility-first)
  - **Sass/SCSS** (Theme variables & complex mixins)
  - **Tailwind CSS** (via UnoCSS presets)
- **Markdown Engine**: `unified` ecosystem (using `remark` for parsing, `rehype` for HTML transformation) with `@shikijs/rehype` for highlighting and custom plugins.
- **Testing**: [Vitest](https://vitest.dev)
- **Runtime/Deployment**:
  - Cloudflare Workers/Pages
  - Node.js (Docker)

## Project Conventions

### Code Style
- **TypeScript**: Strict typing is mandatory.
  - Prefer `const obj = { ... } as const` over `enum`.
  - Use `typeof Object[keyof typeof Object]` for union types.
- **Svelte 5**:
  - Use Runes (`$state`, `$derived`, `$effect`, `$props`) exclusively.
  - **Avoid** `useEffect` patterns from React; use `$effect` only when synchronizing with external side effects.
  - `useState` concepts should be replaced by `$state` proxies.
- **Styling**:
  - **New Components**: Use **Tailwind CSS** utility classes (via UnoCSS).
  - **Colors**: ALWAYS use CSS variables (e.g., `var(--koala-text)`) defined in `src/styles/_theme-utils.scss`.
  - **Markdown**: Use pure CSS in `global.css` (avoid framework-specific styles for content).
- **Icons**:
  - Use **Lucide Icons**.
  - Svelte: `import { Icon } from '@lucide/svelte'`
  - Astro: `import { Icon } from '@lucide/astro'`
  - **Default Size**: 20px.

### Architecture Patterns
- **Data Access**: All DB operations reside in `src/db/`.
  - **Separation**: API Actions (`src/actions`) should call `src/db` functions. `src/db` functions should NEVER call actions.
- **API (Astro Actions)**:
  - Located in `src/actions/`.
  - Return `{ error, data }` objects. Do NOT throw errors to the client; catch and return `error`.
  - Do NOT use `await-to-js` inside actions (they handle safety internally).
- **Authentication**: JWT-based (`jose`) middleware (`src/middleware.ts`).
- **Markdown Processing**: Centralized in `src/lib/markdown/`. Includes custom plugins for metadata (YAML frontmatter), bidirectional linking (`[[link]]`), GFM, Math, and custom directives.

### Testing Strategy
- **Unit & DB Tests**: `pnpm test` using Vitest.
- **Linting**: `pnpm run lint` (ESLint with Antfu config). Only fix ERROR level issues automatically.

### Git Workflow
- **Migrations**:
  - Generate: `pnpm run migration:generate`
  - Apply (D1): `pnpm run migration:d1:local` / `remote`
  - Apply (SQLite): `pnpm run migration:sqlite`

## Core Subsystems

### CMS & Public View
- **Public Content**: Standard Astro SSG/SSR pages (`src/pages/posts.astro`, etc.) for rendering content.
- **Dashboard**: Admin interface for content management, using `src/layouts/dashboard.astro` and specialized list components.

### Unified Editor (`src/components/editor/`)
An IDE-like markdown editing environment embedded in the application.
- **State Management**: Centralized reactive state using Svelte Runes in `store.svelte.ts`.
  - Manages file tree, navigation history, and UI state (sidebar).
- **Draft System**:
  - **Local Persistence**: Unsaved changes are tracked in a `drafts` Map and persisted to `localStorage`.
  - **Conflict Resolution**: UI indicates if local draft differs from server content.
- **File System**:
  - **Virtual Tree**: Parses flat file paths (e.g., `folder/doc.md`) into a hierarchical folder structure in `Sidebar.svelte`.
  - **Creation**: Supports standard file naming and date-based auto-naming for Memos.
- **Media Handling**:
  - Drag-and-drop and Clipboard paste support in `index.svelte`.
  - Optimistic UI with temporary placeholders (`![Uploading...]`) that resolve to uploaded URLs.
- **Live Preview**: Client-side `unified` processor mirrors server rendering for immediate feedback.

## Domain Context
- **Content Types**:
  - **Posts**: Standard articles.
  - **Pages**: Standalone pages.
  - **Memos**: Twitter-like short notes. Auto-titled (`YYYYMMDDHHmm`).
- **Linking**: Supports `[[WikiLink]]` style bidirectional connections.
- **Source Keys**: Use helper `getMarkdownSourceKey(source)` instead of hardcoded strings ('posts', 'memos').

## Important Constraints
- **Dual Runtime**: Code must be compatible with both **Cloudflare Workers** (Edge) and **Node.js** (Container). Avoid Node-specific APIs (like `fs`) unless wrapped/polyfilled or used strictly in build/dev tools.
- **Database Abstraction**: Always check `DATA_SOURCE` env var (`d1` or `sqlite`) if writing raw SQL, though Drizzle handles most abstraction.

## External Dependencies
- **Cloudflare D1** (Production Database option)
- **Object Storage** (S3-compatible or Local FS depending on config)
