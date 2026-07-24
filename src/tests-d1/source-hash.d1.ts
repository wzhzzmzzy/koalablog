import { calculateSourceHash } from '@/lib/files/source-hash'
import { SOURCE_HASH_FIXTURES } from '@/tests/fixtures/source-hash'
import { describe, expect, it } from 'vitest'

describe('D1-compatible canonical File Source Hash', () => {
  it.each(SOURCE_HASH_FIXTURES)('matches the shared $name fixture', async (fixture) => {
    await expect(calculateSourceHash(fixture.renderer, fixture.content)).resolves.toBe(fixture.expected)
  })
})
