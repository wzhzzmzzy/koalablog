import type { Page } from '@playwright/test'

export async function probeSvelteToolchainInBrowser(page: Page) {
  return page.evaluate(async () => {
    const toolchainModulePath = '/src/lib/svelte/toolchain.ts'
    const toolchain = await import(/* @vite-ignore */ toolchainModulePath)
    return toolchain.probeSvelteToolchain()
  })
}
