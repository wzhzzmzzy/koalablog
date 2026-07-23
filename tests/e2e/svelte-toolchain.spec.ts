import { expect, test } from '@playwright/test'
import { SVELTE_TOOLCHAIN_VERSIONS } from '../../src/lib/svelte/toolchain-versions'
import { E2E_BASE_URL } from './test-config'
import { probeSvelteToolchainInBrowser } from './toolchain'

const toolchainRequestPattern = /artifact\.worker|\/toolchain(?:[.-]|$)|bindings_wasm|runtime-registry|svelte_compiler|rollup_browser|unocss_core|unocss_preset/
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
  const probe = await probeSvelteToolchainInBrowser(page)

  expect(probe).toMatchObject({
    compilerVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
    runtimeVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
    rollupVersion: SVELTE_TOOLCHAIN_VERSIONS.rollup,
    svelteLanguageVersion: SVELTE_TOOLCHAIN_VERSIONS.svelteLanguage,
    unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
    compiled: true,
    bundled: true,
    generatedCss: true,
  })
  expect(probe.runtimeImports).toEqual(expect.arrayContaining([
    'svelte/internal/client',
    'svelte/internal/disclose-version',
  ]))
  expect(toolchainRequests.length).toBeGreaterThan(0)
  expect(toolchainRequests.every(url => new URL(url).origin === new URL(E2E_BASE_URL).origin)).toBe(true)
  expect(blockedRemoteRequests).toHaveLength(0)
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
