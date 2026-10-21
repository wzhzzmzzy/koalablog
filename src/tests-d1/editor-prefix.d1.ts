import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { readEditorCounts, readEditorPrefix } from '@/db/editor'
import { readEditorReferences, readEditorTags } from '@/db/editor-completion'
import { searchEditorFiles } from '@/db/editor-search'
import { add } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

describe('D1 editor one-level queries', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
  })

  it('aggregates only direct Prefix names in SQL and fetches direct active Source for the Owner', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root Source', userId: 1 })
    await add(env, { path: '/😀/100%/direct', renderer: 'markdown', content: 'direct Source', userId: 1 })
    await add(env, { path: '/😀/100%/nested/deep', renderer: 'markdown', content: 'deep Source', userId: 1 })
    await add(env, { path: '/😀/100x/other', renderer: 'markdown', content: 'other', userId: 1 })
    await add(env, { path: '/foreign/visible', renderer: 'markdown', content: 'foreign Source', userId: 2 })
    await add(env, { path: '/deleted/old', renderer: 'markdown', content: 'deleted Source', userId: 1, deletedAt: new Date() })
    const root = await readEditorPrefix(env, '/', 1)
    expect(root.files.map(file => file.path)).toEqual(['/root'])
    expect(root.prefixes).toEqual(['/😀/'])
    const child = await readEditorPrefix(env, '/😀/100%/', 1)
    expect(child.files.map(file => file.content)).toEqual(['direct Source'])
    expect(child.prefixes).toEqual(['/😀/100%/nested/'])
    expect(await readEditorCounts(env, 1)).toEqual({ active: 4, trash: 1 })
  })

  it('runs on-demand search and metadata completion queries on D1', async () => {
    await add(env, { path: '/deep/100%_file', renderer: 'markdown', content: '#shared-tag\nsearch needle', userId: 1 })
    await add(env, { path: '/deep/another', renderer: 'markdown', content: '#shared-tag', userId: 1 })
    await add(env, { path: '/foreign/file', renderer: 'markdown', content: '#foreign-tag\nsearch needle', userId: 2 })
    expect((await searchEditorFiles(env, 1, 'SEARCH NEEDLE')).files.map(file => file.path)).toEqual(['/deep/100%_file'])
    const references = await readEditorReferences(env, 1, '100%_')
    expect(references.map(file => file.path)).toEqual(['/deep/100%_file'])
    expect(references[0]).not.toHaveProperty('content')
    expect(await readEditorTags(env, 1, 'shared')).toEqual([{ tag: 'shared-tag', fileCount: 2, updatedAt: expect.any(Date) }])
  })
})
