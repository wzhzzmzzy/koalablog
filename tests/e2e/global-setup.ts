import { chromium, type Page } from '@playwright/test'
import { E2E_AUTHORIZATION, E2E_BASE_URL } from './test-config'
import { probeSvelteToolchainInBrowser } from './toolchain'

async function visit(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${E2E_BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 120_000 })
      return
    }
    catch (error) {
      if (attempt === 2)
        throw error
      await page.waitForTimeout(500)
    }
  }
}

export default async function warmE2EApplication() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    extraHTTPHeaders: { Authorization: E2E_AUTHORIZATION },
  })
  const page = await context.newPage()
  try {
    await visit(page, '/dashboard/settings')
    await visit(page, '/dashboard/template')
    await visit(page, '/dashboard/edit?path=/phase-two')
    await probeSvelteToolchainInBrowser(page)
  }
  finally {
    await context.close()
    await browser.close()
  }
}
