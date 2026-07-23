import { expect, test } from '@playwright/test'
import { E2E_BASE_URL } from './test-config'
import {
  buildSvelteSourceInBrowser,
  diagnoseSvelteSourceInBrowser,
} from './toolchain'

const toolchainRequestPattern = /artifact\.worker|\/toolchain(?:[.-]|$)|bindings_wasm|runtime-registry|svelte_compiler|rollup_browser|unocss_core|unocss_preset|unocss_transformer/
const remoteToolchainHostPattern = /registry\.npmjs\.org|esm\.sh|unpkg\.com|cdn\.jsdelivr\.net/

test.describe.configure({ timeout: 60_000 })

test('same-origin Worker toolchain builds a local Svelte probe with npm and CDNs blocked', async ({ page }) => {
  const toolchainRequests: string[] = []
  const blockedRemoteRequests: string[] = []
  page.on('request', (request) => {
    if (toolchainRequestPattern.test(request.url()))
      toolchainRequests.push(request.url())
  })
  await page.route('**/*', async (route) => {
    if (remoteToolchainHostPattern.test(route.request().url())) {
      blockedRemoteRequests.push(route.request().url())
      await route.abort()
      return
    }
    await route.continue()
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const result = await buildSvelteSourceInBrowser(page, `<script>
  import { writable } from 'svelte/store'
  import { fade } from 'svelte/transition'

  const message = writable('Koala')
</script>

{#if $message}
  <h1 class="text-red-500" transition:fade>{$message}</h1>
{/if}`)

  expect(result).toMatchObject({ type: 'build-success' })
  if (result.type !== 'build-success')
    throw new Error(result.error.message)
  expect(result.javascript).not.toMatch(/^\s*import\s/m)
  expect(result.css).toContain(':where([data-koala-artifact-root]) .text-red-500')
  expect(toolchainRequests.length).toBeGreaterThan(0)
  expect(toolchainRequests.every(url => new URL(url).origin === new URL(E2E_BASE_URL).origin)).toBe(true)
  expect(blockedRemoteRequests).toHaveLength(0)
})

test('diagnose compiles Svelte without loading the UnoCSS generator', async ({ page }) => {
  const unocssRequests: string[] = []
  page.on('request', (request) => {
    if (/unocss_(?:core|preset|transformer)/.test(request.url()))
      unocssRequests.push(request.url())
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const result = await diagnoseSvelteSourceInBrowser(page, '<h1 class="text-red-500">Koala</h1>')

  expect(result.diagnostics).toEqual([])
  expect(unocssRequests).toHaveLength(0)
})

test('build prepends root-scoped UnoCSS and preserves the global-style warning', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const result = await buildSvelteSourceInBrowser(page, `<div class="card font-ui text-red-500">Koala</div>
<style>
  .card { --at-apply: p-2 text-blue-500; }
  :global(body) { color: rebeccapurple; }
</style>`)

  expect(result).toMatchObject({
    type: 'build-success',
    warnings: [{ code: 'global_style_escape', severity: 'warning' }],
  })
  if (result.type !== 'build-success')
    throw new Error(result.error.message)
  expect(result.css).toContain(':where([data-koala-artifact-root]) .text-red-500')
  expect(result.css).not.toContain('--at-apply')
  expect(result.css.indexOf('.text-red-500')).toBeLessThan(result.css.indexOf('.card.svelte-'))
})

test('ordinary Markdown editor and public routes do not request the Worker toolchain', async ({ page }) => {
  const toolchainRequests: string[] = []
  page.on('request', (request) => {
    if (toolchainRequestPattern.test(request.url()))
      toolchainRequests.push(request.url())
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  await page.goto('/phase-two')
  await page.waitForLoadState('networkidle')

  expect(toolchainRequests).toHaveLength(0)
})
