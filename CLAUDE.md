# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

### Tech Stack

- **Framework**: Astro 5 with Svelte 5 components
- **Database**: Dual-mode (Cloudflare D1 or SQLite) with Drizzle ORM
- **Styling**: UnoCSS + Sass with Catppuccin theming
- **Deployment**: Cloudflare Pages or standalone

### Project Structure

#### Core Directories

- `src/actions/` - Astro actions (API endpoints) organized by domain (db, form, oss)
- `src/components/` - Svelte 5 components with reactive state (`$state`, `$props`)
- `src/db/` - Database schema, models, and operations (Drizzle-based)
- `src/lib/` - Reusable utilities organized by domain
- `src/pages/` - Astro pages and API routes
- `src/styles/` - Theming system with Catppuccin support

#### Key Subsystems

**Markdown Processing** (`src/lib/markdown/`)

- Custom markdown-it plugins with meta frontmatter support
- `meta-plugin.ts` - Parses `key: value` frontmatter
- `markdown-parser.ts` - Unified parsing utility for content, links, tags
- `double-link-plugin.ts` - Handles `[[link]]` syntax for bidirectional linking

**Database Layer** (`src/db/`)

- Multi-backend support (D1/SQLite) via environment config
- `schema.ts` - Drizzle schema definitions
- `markdown.ts` - Core content operations with link resolution
- Batch operations for import/export functionality

**Authentication** (`src/lib/auth/`)

- JWT-based auth system
- Middleware integration at `src/middleware.ts`

**Theming** (`src/styles/`)

- `catppuccin.scss` - Main theme implementation
- `_theme-utils.scss` - Reusable theme mixins and functions
- CSS custom properties for dynamic theming

**Import/Export System**

- **File picker import**: Browser-native file selection with markdown parsing
- **Batch processing**: Multi-file import with progress states (loading/parsing/saving)
- **Frontmatter handling**: Extract meta fields (`createdAt`, `updatedAt`, `link`) and strip from content
- **Link resolution**: Resolve `[[links]]` against existing posts during import
- **Error display**: Show import/save errors directly to users
- **ZIP export**: Batch export with metadata preservation

## Development Guidelines

### API Design Principles

- **Client interfaces**: Use Astro Actions instead of API endpoints when providing interfaces to clients
- **Server-side data access**: Use `src/db` functions directly on the server, do not call actions

### Component Architecture

- Svelte 5 with modern reactivity (`$state`, `$derived`, `$effect`)
- TypeScript throughout with strict typing
- Component-scoped SCSS with theme utilities

### Code Quality Standards

#### General Principles

- Before writing code, consider if there's a simpler, clearer implementation approach
- Before implementing complex logic, check if similar implementations exist in the project and consider reusability
- Split components/functions if they exceed 400 lines (components) or 100 lines (functions)

#### TypeScript Patterns

- Use `const` objects with `as const` instead of enums for better compatibility
- Type unions from `typeof Object[keyof typeof Object]` for type safety
- **Astro Actions**: Do NOT use `await-to-js` or try-catch blocks - actions return `{error, data}` objects where `error` contains thrown exceptions and `data` contains successful results

#### Style Guidelines

**UnoCSS for Layouts and Utilities**

- Use UnoCSS classes for layout, spacing, responsive design, and utility styling
- Prefer utility-first approach for component styling

**Pure CSS for Markdown Rendering**

- Use pure CSS in `global.css` for markdown content rendering
- Avoid framework-specific styling for content that needs to be portable

**Sass with CSS Variables**

- Use Sass only when CSS variables and mixins provide clear benefits
- All colors must use CSS custom properties following Catppuccin theme system
- Theme utilities should be reusable across components

#### Accessibility Standards

**Semantic HTML**

- Use proper semantic elements: `<button>` for actions, `<nav>` for navigation, `<main>` for primary content
- Avoid `<div>` and `<span>` abuse - prefer semantic alternatives

**ARIA Attributes**

- Add proper `aria-label`, `aria-describedby`, `role` attributes for interactive elements
- Use `aria-modal="true"` for modals, `role="dialog"` for dialogs
- Implement proper focus management and keyboard navigation

### Database Operations

- All DB operations through Drizzle ORM
- Astro actions for client-facing server operations
- Direct `src/db` function calls for server-side data access
- Batch operations for performance (import/export)

### Astro Actions Best Practices

- **Return format**: Actions return `{error, data}` objects automatically
- **Error handling**: Check `result.error` for exceptions, `result.data` for success
- **No wrapping needed**: Don't use `await-to-js` or try-catch around action calls
- **Schema preprocessing**: Use `z.preprocess()` for type transformations (e.g., string dates to Date objects)
- **Example**: `const result = await actions.db.markdown.all(); if (result.error) { ... } else { use result.data }`

### Markdown Ecosystem

- **YAML Frontmatter**: Standard `---` delimited blocks for metadata
- **Meta extraction**: Parse frontmatter for `createdAt`, `updatedAt`, `link`, `tags`, etc.
- **Content stripping**: Use `stripMetaBlock()` to remove frontmatter from saved content
- **Bidirectional linking**: `[[link]]` syntax for interconnected notes
- **Tag extraction**: From both content (#tag) and frontmatter
- **Unified parsing**: `parseMarkdownContent()` and `batchParseMarkdown()` utilities

## Environment Configuration

Required `.env` variables:

- `DATA_SOURCE`: 'sqlite' | 'd1'
- `DEPLOY_MODE`: 'cloudflare' | 'standalone'
- Cloudflare-specific: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`
- SQLite-specific: `SQLITE_URL`

## Key Commands

### Development

- **Cloudflare Pages mode**: `pnpm run dev:d1` (requires CF D1 setup)
- **Standalone mode**: `pnpm run dev:sqlite` (local SQLite)
- **Standard dev**: `pnpm run dev`

### Database Operations

- **Initialize D1**: `pnpm run d1:init`
- **Initialize SQLite**: `pnpm run sqlite:init`
- **Clean DB**: `pnpm run db:clean`
- **Generate migrations**: `pnpm run migration:generate`
- **Apply D1 migrations**: `pnpm run migration:d1:local` (local) or `pnpm run migration:d1:remote` (remote)

### Build & Deploy

- **Build for Cloudflare**: `pnpm run build:cf`
- **Preview Cloudflare**: `pnpm run preview` or `pnpm run preview:pages`
- **Standard build**: `pnpm run build`

### Code Quality

- **Lint**: `pnpm run lint` or `pnpm run lint:fix`
- **Test**: `pnpm test` (uses Vitest)
- **Single test**: `pnpm test <filename>`

## Testing

- Vitest for unit tests
- Component tests for utilities
- Database operation tests with mock environments