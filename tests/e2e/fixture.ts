import { test as base } from '@playwright/test'
import { resetEditorE2EFixture } from '../../scripts/test/editor-e2e-fixture'

interface E2EFixtures {
  autoFixture: void
}

export const test = base.extend<E2EFixtures>({
  autoFixture: [async ({ page: _page }: { page: unknown }, use: () => Promise<void>) => {
    await resetEditorE2EFixture()
    await use()
  }, { auto: true, scope: 'test' }],
})

export { expect } from '@playwright/test'
