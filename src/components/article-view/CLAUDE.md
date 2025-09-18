# Article View Components

This directory contains components for rendering markdown articles in the KoalaBlog application.

## Components

### `index.astro`

- **Purpose**: Server-side article rendering component
- **Props**:
  - `article: Markdown` - Article metadata and content
  - `content: string` - Pre-rendered HTML content
  - `showOutline?: boolean` - Whether to display article outline (default: false)
- **Features**:
  - Shows article title and creation date for Post-type articles
  - Renders content using `set:html` directive
  - Simple server-side only implementation
  - Optional outline sidebar with heading navigation
  - Automatic heading ID generation for anchor links

### `client.astro`

- **Purpose**: Client-side enhanced article rendering with dynamic markdown processing
- **Props**:
  - `article: Markdown` - Article metadata and content
  - `content: string` - Pre-rendered HTML content (fallback)
  - `renderLangSet?: Set<string>` - Programming languages for syntax highlighting
  - `showOutline?: boolean` - Whether to display article outline (default: false)
- **Features**:
  - Custom web component (`<article-client>`) with client-side markdown processing
  - Dynamic content rendering using the markdown parser with double-link support
  - Lazy loading of markdown module for better performance
  - Fallback server-rendered content that gets replaced by client-rendered version
  - Integration with copy listeners and tag listeners via `window.refreshCopyListener()` and `window.refreshTagListener()`
  - Supports outgoing links resolution for bidirectional linking
  - Optional outline sidebar with heading navigation
  - Automatic heading ID generation for both server and client-rendered content

### `outline.svelte`

- **Purpose**: Svelte component for displaying article outline/table of contents
- **Props**:
  - `title: string` - Article title for outline header
  - `headings: HeadingItem[]` - Pre-processed heading data from parent Astro component
- **Features**:
  - Displays pre-extracted heading hierarchy with indentation (level-based CSS classes)
  - Smooth scroll navigation to heading anchors
  - No async processing - all data provided by parent component
  - Responsive design with mobile-friendly layout
  - Clean, accessible UI with proper focus management
  - Optimized for both SSR and client-side hydration

## Architecture Notes

- **Server vs Client**: `index.astro` is pure server-side, while `client.astro` provides enhanced client-side functionality
- **Progressive Enhancement**: `client.astro` uses server-rendered content as fallback before client-side rendering
- **Custom Elements**: Uses modern web components pattern for client-side interactivity
- **Markdown Integration**: Leverages the project's custom markdown parsing system with double-link plugin support
- **Performance**: Uses `requestIdleCallback` for non-critical post-render tasks
- **Outline Processing**: Heading extraction and ID generation happens at the Astro component level (server-side) to avoid async complexity in Svelte components
- **Environment Separation**: Server-side uses `node-html-parser` via dynamic imports, client-side uses native `DOMParser` when needed

## Supporting Files

### `article-view.css`

Shared CSS file containing layout styles for both Astro components:

- `.article-container` - Main flex container for article and sidebar
- `.article-sidebar` - Sticky sidebar positioning for outline
- `.article-main` - Main content area with flexible width
- Responsive breakpoints for mobile-friendly layout

### `@/lib/utils/heading-id.ts`

Utility functions for heading ID management with environment-aware implementations:

**Async Functions (Universal - Server/Browser):**
- `generateHeadingId(text, index)` - Generates URL-friendly IDs from heading text
- `addHeadingIds(htmlContent)` - Adds unique IDs to all heading elements in HTML (async)
- `extractHeadings(htmlContent)` - Extracts heading information for outline generation (async)

**Sync Functions (Browser-only):**
- `addHeadingIdsSync(htmlContent)` - Browser-only synchronous version for client-side usage
- `extractHeadingsSync(htmlContent)` - Browser-only synchronous version for client-side usage

**Types:**
- `HeadingItem` interface - Type definition for heading data structure

**Implementation Notes:**
- Uses dynamic imports to avoid bundling `node-html-parser` in browser builds
- Server-side uses `node-html-parser` for HTML parsing
- Browser-side uses native `DOMParser` API
- Sync versions throw errors when used in Node.js environment

## Usage Constraints

1. **Functional Consistency**: `client.astro` and `index.astro` must maintain consistent functionality and output
2. **Performance-Based Selection**:
   - Use `index.astro` as the default choice for most scenarios (faster server-side rendering)
   - Use `client.astro` only when server-side rendering cannot complete quickly enough
   - Fallback to client-side rendering for complex articles that would cause server rendering delays
3. **Outline Usage**:
   - Pass `showOutline={true}` prop to enable outline sidebar
   - Outline component automatically extracts headings and generates navigation
   - Both server-side and client-side components support outline functionality consistently
