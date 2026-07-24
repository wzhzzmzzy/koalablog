import { calculateSourceHash } from '@/lib/files/source-hash'
import { RENDERER_MODE } from '@/lib/files/types'
import { SOURCE_HASH_FIXTURES } from '@/tests/fixtures/source-hash'
import { describe, expect, it } from 'vitest'

describe('canonical File Source Hash', () => {
  it.each(SOURCE_HASH_FIXTURES)('hashes $name from the versioned canonical payload', async (fixture) => {
    await expect(calculateSourceHash(fixture.renderer, fixture.content)).resolves.toBe(fixture.expected)
  })

  it('rejects null instead of treating it as a blank Source', async () => {
    await expect(calculateSourceHash(RENDERER_MODE.Markdown, null as never)).rejects.toThrow(
      'File Source content must be a string',
    )
  })

  it('rejects a Renderer outside the persisted File contract', async () => {
    await expect(calculateSourceHash('html' as never, '')).rejects.toThrow(
      'Unsupported File Renderer: html',
    )
  })
})
