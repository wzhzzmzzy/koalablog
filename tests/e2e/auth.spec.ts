import type { Page } from '@playwright/test'
import { expect, test } from './fixture'
import { E2E_ADMIN, E2E_MEMBER } from './test-config'

async function loginAs(page: Page, credentials: { username: string, password: string }) {
  if (!page.url().includes('/login'))
    await page.goto('/login')
  await page.getByLabel('Username').fill(credentials.username)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: /login/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}

test.describe('multi-user auth', () => {
  test('logs in with username and password and keeps the session', async ({ browser }) => {
    const page = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()

    await loginAs(page, E2E_ADMIN)
    await page.goto('/dashboard')

    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('redirects a private file to login and returns after signing in', async ({ browser }) => {
    const page = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()

    await page.goto('/memo/secret')
    await expect(page).toHaveURL(/\/login\?from=/)

    await loginAs(page, E2E_ADMIN)
    await expect(page).toHaveURL(/\/memo\/secret/)
    await expect(page.getByText('secret memo body')).toBeVisible()
  })

  test('hides a private file from a signed-in non-owner', async ({ browser }) => {
    const page = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()

    await loginAs(page, E2E_MEMBER)
    await page.goto('/memo/secret')

    await expect(page).toHaveURL(/\/404/)
  })

  test('switches between posts and memos lists on the index', async ({ browser }) => {
    const page = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'hello' })).toBeVisible()

    await page.getByTitle('My Gossips').first().click()
    await expect(page).toHaveURL(/\?s=memo/)
    await expect(page.getByRole('link', { name: 'public-note' })).toBeVisible()

    await page.getByTitle('My Posts').first().click()
    await expect(page.getByRole('link', { name: 'hello' })).toBeVisible()
  })

  test('shows the account zone to every user and the site zone only to the admin', async ({ browser }) => {
    const adminPage = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()
    await loginAs(adminPage, E2E_ADMIN)
    await adminPage.goto('/dashboard/settings')
    await expect(adminPage.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(adminPage.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(adminPage.getByRole('heading', { name: 'Blog', exact: true })).toBeVisible()

    const memberPage = await (await browser.newContext({ extraHTTPHeaders: {} })).newPage()
    await loginAs(memberPage, E2E_MEMBER)
    await memberPage.goto('/dashboard/settings')
    await expect(memberPage.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(memberPage.getByRole('heading', { name: 'Users' })).toBeHidden()
    await expect(memberPage.getByRole('heading', { name: 'Blog', exact: true })).toBeHidden()
  })
})
