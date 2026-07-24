import { auditSourceHashRows } from '@/lib/files/source-hash-audit'
import { describe, expect, it } from 'vitest'

describe('source Hash audit', () => {
  it('blocks missing, mismatched, malformed, and non-string Source records in stable ID order', async () => {
    const report = await auditSourceHashRows([
      {
        id: 6,
        renderer: 'markdown',
        content: 'invalid hash',
        sourceHash: 'not-a-sha256',
        revision: 2,
        deletedAt: null,
      },
      {
        id: 2,
        renderer: 'svelte',
        content: '',
        sourceHash: null,
        revision: 1,
        deletedAt: new Date(1_770_000_000_000),
      },
      {
        id: 5,
        renderer: 'markdown',
        content: null,
        sourceHash: null,
        revision: 4,
        deletedAt: new Date(1_770_000_000_000),
      },
      {
        id: 1,
        renderer: 'markdown',
        content: '',
        sourceHash: 'c4a3e04fa78d47ace9853e81fcedcf84172449d37a72852120d3a41b14a6c1f5',
        revision: 3,
        deletedAt: null,
      },
      {
        id: 4,
        renderer: 'unknown',
        content: 'Source',
        sourceHash: null,
        revision: 8,
        deletedAt: null,
      },
      {
        id: 3,
        renderer: 'svelte',
        content: '<h1>mismatch</h1>',
        sourceHash: '0000000000000000000000000000000000000000000000000000000000000000',
        revision: 5,
        deletedAt: null,
      },
    ])

    expect(report).toMatchObject({
      schemaVersion: 1,
      status: 'blocked',
      summary: {
        total: 6,
        active: 4,
        recycled: 2,
        current: 1,
        missing: 1,
        mismatched: 1,
        invalid: 3,
      },
    })
    expect(report.issues.map(issue => [issue.id, issue.state, issue.code])).toEqual([
      [2, 'recycled', 'missing_source_hash'],
      [3, 'active', 'source_hash_mismatch'],
      [4, 'active', 'invalid_renderer'],
      [5, 'recycled', 'invalid_content'],
      [6, 'active', 'invalid_source_hash'],
    ])
  })
})
