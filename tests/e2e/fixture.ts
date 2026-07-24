import { expect, test } from '@playwright/test'
import { resetEditorE2EFixture } from '../../scripts/test/editor-e2e-fixture'

test.beforeEach(async () => {
  await resetEditorE2EFixture()
})

export { expect, test }
