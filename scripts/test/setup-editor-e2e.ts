import { execSync } from 'node:child_process'
import { createEditorE2EFixture } from './editor-e2e-fixture'

try {
  execSync('lsof -ti :4322 | xargs kill -9', { stdio: 'ignore' })
}
catch {
}

await createEditorE2EFixture()
