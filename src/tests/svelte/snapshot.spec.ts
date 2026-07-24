import { canonicalizeSnapshotHtml, isCanonicalSnapshotHtml, snapshotDescription } from '@/lib/svelte/snapshot'
import { describe, expect, it } from 'vitest'
import { canonicalSnapshotFixture, snapshotFixture } from './snapshot-fixture'

describe('svelte Snapshot serialization', () => {
  it('removes executable markup while preserving safe body structure', async () => {
    const snapshot = await canonicalizeSnapshotHtml(snapshotFixture)

    expect(snapshot).toBe(canonicalSnapshotFixture)
  })

  it('rejects a submitted Snapshot that is executable or not already canonical', async () => {
    await expect(isCanonicalSnapshotHtml('<p onclick="alert(1)">Koala</p>')).resolves.toBe(false)
    await expect(isCanonicalSnapshotHtml('<p>Koala</p>')).resolves.toBe(true)
    await expect(isCanonicalSnapshotHtml('<p title="Koala" id="snapshot">Koala</p>')).resolves.toBe(false)
  })

  it('derives the first non-empty paragraph description with a Unicode code-point bound', () => {
    expect(snapshotDescription('<p> </p><p>Koala <strong>Blog</strong></p>')).toBe('Koala Blog')
    expect(snapshotDescription(`<p>${'🐨'.repeat(161)}</p>`)).toBe('🐨'.repeat(160))
  })
})
