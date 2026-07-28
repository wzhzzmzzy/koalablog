/**
 * Page matrix and page-state definitions for the visual baseline.
 *
 * Each entry fully determines the rendered pixels: URL, viewport, colour
 * scheme, auth state, and an optional `pinState` hook that stabilises
 * time-dependent UI before capture.
 *
 * The matrix is consumed by capture.ts and is also serialised into the
 * manifest so that a later slice can reproduce the exact same set of
 * captures from the manifest alone.
 *
 * ---
 * Pinned conditions (issue 02 requirements):
 *  - Fixed seed data: the e2e fixture (scripts/test/setup-editor-e2e.ts)
 *    creates /post/hello (Markdown post) and /phase-two (editor file) among
 *    others.  We do NOT modify the fixture.
 *  - Logged-in state for dashboard pages: emulated via the Authorization
 *    Bearer header (koalablog-playwright API token → admin user).  Public
 *    pages use a context without the header so /login renders its form.
 *  - Fixed theme: light = latte, dark = mocha (defaults from layout.astro).
 *  - Fixed viewports: desktop 1280×800, mobile 390×844.
 *  - Animations / caret blink / time-dependent UI disabled via CSS injection
 *    in the shared stabilisePage() helper (see capture.ts).
 *  - Fonts + network idle awaited before every capture.
 *  - Editor capture pins: file /phase-two open, sidebar visible (desktop
 *    default w-64), Edit Source mode (not Preview), no dirty buffer, focus
 *    blurred to remove the blinking caret.
 */

import type { MatrixEntry } from './types'

/** Desktop viewport used for all non-mobile captures. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const

/** Mobile viewport used for home + post captures. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const

/** E2E port — must not collide with the default 4322 used by playwright.config.ts. */
export const E2E_PORT = 4333

/** Base URL the harness captures against. */
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`

/** Bearer token accepted by the e2e fixture (see editor-e2e-fixture.ts). */
export const E2E_AUTHORIZATION = 'Bearer koalablog-playwright'

/**
 * CSS injected into every page before capture to eliminate rendering jitter
 * from animations, transitions, caret blink, and other time-dependent UI.
 *
 * The injection happens after navigation + networkidle so that it overrides
 * runtime styles without preventing the page from initialising.
 */
export const STABILISE_CSS = `
/* Kill all animations and transitions */
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
}
/* Hide the CodeMirror blinking caret */
.cm-cursor { display: none !important; }
/* Hide caret colour so no text-cursor glyph renders */
input, textarea, [contenteditable], .cm-editor { caret-color: transparent !important; }
/* Force any lazy-loaded images to show their final state */
img { animation: none !important; }
`.trim()

/**
 * Pin the editor page to a stable visual state:
 *  - Ensure the file list sidebar is visible (desktop default w-64).
 *  - Ensure Edit Source mode is active (not Preview).
 *  - Blur focus to remove the active-line highlight and caret.
 *  - Wait for the CodeMirror editor to render the file content.
 */
async function pinEditorState(page: import('@playwright/test').Page): Promise<void> {
  // Ensure "Edit Source" mode is active (not "Preview File").
  const editSourceButton = page.getByRole('button', { name: 'Edit Source' })
  if (await editSourceButton.isVisible().catch(() => false)) {
    await editSourceButton.click()
  }

  // Wait for the CodeMirror source editor to be visible.
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.waitFor({ state: 'visible', timeout: 15_000 })

  // Ensure the sidebar is open (desktop default).  If it was collapsed
  // (w-0), click the toggle to expand it.
  const sidebar = page.getByTestId('editor-sidebar')
  if (await sidebar.isVisible().catch(() => false)) {
    const sidebarClass = await sidebar.getAttribute('class')
    if (sidebarClass && /\bw-0\b/.test(sidebarClass)) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    }
  }

  // Blur all focus to remove the active-line highlight and caret.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur()
    document.body.focus()
  })
}

/**
 * The full page matrix — 10 captures total.
 *
 * Issue requirements:
 *  - Home (/) desktop + mobile + dark
 *  - Markdown post (/post/hello) desktop + mobile
 *  - /login desktop
 *  - /404 desktop
 *  - Dashboard home (/dashboard) desktop
 *  - Dashboard settings (/dashboard/settings) desktop
 *  - Editor (/dashboard/edit?path=/phase-two) desktop
 */
export const PAGE_MATRIX: MatrixEntry[] = [
  {
    id: 'home-desktop-light',
    path: '/',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: 'home-mobile-light',
    path: '/',
    viewport: MOBILE_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: 'home-desktop-dark',
    path: '/',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'dark',
    authenticated: false,
  },
  {
    id: 'post-desktop-light',
    path: '/post/hello',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: 'post-mobile-light',
    path: '/post/hello',
    viewport: MOBILE_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: 'login-desktop-light',
    path: '/login',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: '404-desktop-light',
    path: '/__baseline_nonexistent__',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: false,
  },
  {
    id: 'dashboard-desktop-light',
    path: '/dashboard',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: true,
  },
  {
    id: 'dashboard-settings-desktop-light',
    path: '/dashboard/settings',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: true,
  },
  {
    id: 'editor-desktop-light',
    path: '/dashboard/edit?path=/phase-two',
    viewport: DESKTOP_VIEWPORT,
    colorScheme: 'light',
    authenticated: true,
    pinState: pinEditorState,
  },
]
