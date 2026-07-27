import { test as base } from '@playwright/test'
import { resetEditorE2EFixture } from '../../scripts/test/editor-e2e-fixture'

export const test = base.extend({
  autoFixture: [async ({ page: _page }, use) => {
    await resetEditorE2EFixture()
    await use()
  }, { auto: true, scope: 'test' }],
})

export { expect } from '@playwright/test'
