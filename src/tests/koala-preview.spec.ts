import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { startSveltePreview } from '../../scripts/koala/preview.mjs'

const directories: string[] = []

afterEach(async () => Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('local Svelte preview', () => {
  it.skipIf(process.env.KOALA_PREVIEW_INTEGRATION !== '1')('serves an isolated localhost-only Vite preview without creating an Artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koala-preview-'))
    directories.push(root)
    const source = join(root, 'preview.svelte')
    await writeFile(source, '<h1>Local preview</h1>')
    const preview = await startSveltePreview(source, { port: 0 })
    try {
      expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:/)
      const response = await fetch(preview.url)
      expect(await response.text()).toContain('main.js')
      const main = await fetch(new URL('main.js', preview.url))
      expect(main.ok).toBe(true)
      expect(await main.text()).toContain('mount(App')
    }
    finally {
      await preview.close()
    }
  })
})
