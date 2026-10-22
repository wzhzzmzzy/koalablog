import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectDB, MarkdownSource } from '@/db'
import { readActiveMetadataByOwner, readAllMetadata, readOwnedFilePaths } from '@/db/markdown'
import { readDeploymentSummary } from '@/db/render-artifact'
import { markdown, markdownRender } from '@/db/schema'

export function defineMetadataReadContract(harness: {
  name: string
  env: Env
  prepare: () => Promise<void>
  cleanup?: () => Promise<void>
}) {
  describe(`metadata reads ${harness.name} contract`, () => {
    beforeEach(async () => {
      await harness.prepare()
      await connectDB(harness.env).insert(markdown).values([
        { id: 1, path: '/memo/owned', source: MarkdownSource.Memo, userId: 7 },
        { id: 2, path: '/memo/other', source: MarkdownSource.Memo, userId: 8 },
        { id: 3, path: '/memo/trashed', source: MarkdownSource.Memo, userId: 7, deletedAt: new Date() },
        { id: 4, path: '/post/owned', source: MarkdownSource.Post, userId: 7 },
      ].map(file => ({
        ...file,
        title: file.path.split('/').at(-1)!,
        content: 'large Source '.repeat(20_000),
        sourceHash: `hash-${file.id}`,
        revision: file.id,
        private: true,
        createdAt: new Date(file.id * 1000),
        updatedAt: new Date(file.id * 2000),
      })))
    })
    afterEach(async () => harness.cleanup?.())

    it('lists only active Owner paths for explicit import checks', async () => {
      expect((await readOwnedFilePaths(harness.env, 7)).sort()).toEqual(['/memo/owned', '/post/owned'])
      expect(await readOwnedFilePaths(harness.env, 8)).toEqual(['/memo/other'])
      expect(await readOwnedFilePaths(harness.env, 9)).toEqual([])
    })

    it('projects only list metadata while preserving Source, Owner, trash and order filters', async () => {
      const batch = readAllMetadata(harness.env, MarkdownSource.Memo)
      const manifest = readActiveMetadataByOwner(harness.env, 7)
      for (const query of [batch, manifest]) {
        expect(query.toSQL().sql).not.toMatch(/"(?:content|tags|incoming_links|outgoing_links)"/)
      }
      expect(await batch).toEqual([2, 1].map(id => ({
        id,
        path: id === 1 ? '/memo/owned' : '/memo/other',
        title: id === 1 ? 'owned' : 'other',
        renderer: 'markdown',
        sourceHash: `hash-${id}`,
        revision: id,
      })))
      expect(await manifest).toEqual([4, 1].map(id => ({
        id,
        path: id === 1 ? '/memo/owned' : '/post/owned',
        renderer: 'markdown',
        sourceHash: `hash-${id}`,
        revision: id,
        updatedAt: new Date(id * 2000),
      })))
    })

    it('keeps status lifecycle and Owner checks without loading Artifact payloads', async () => {
      const db = connectDB(harness.env)
      await db.run('UPDATE markdown SET renderer = \'svelte\' WHERE id = 4')
      expect(await readDeploymentSummary(harness.env, 4, 7)).toEqual({
        status: 'not_deployed',
        deployedSourceHash: null,
        artifactHash: null,
      })
      await db.insert(markdownRender).values({
        fileId: 4,
        schemaVersion: 2,
        renderer: 'svelte',
        svelteVersion: '5',
        unocssVersion: '65',
        unocssConfigHash: 'config',
        sourceHash: 'hash-4',
        artifactHash: 'artifact',
        javascriptResourceHash: 'js',
        cssResourceHash: 'css',
        javascript: 'j'.repeat(100_000),
        css: 'c'.repeat(100_000),
        dependencies: [],
      })
      await db.run('UPDATE markdown_render SET dependencies = \'invalid JSON must not be decoded by a status read\'')
      expect(await readDeploymentSummary(harness.env, 4, 7)).toEqual({
        status: 'deployed',
        deployedSourceHash: 'hash-4',
        artifactHash: 'artifact',
      })
      await db.run('UPDATE markdown SET sourceHash = \'changed\' WHERE id = 4')
      expect(await readDeploymentSummary(harness.env, 4, 7)).toEqual({
        status: 'deployment_drift',
        deployedSourceHash: 'hash-4',
        artifactHash: 'artifact',
      })
      expect(await readDeploymentSummary(harness.env, 1, 7)).toEqual({
        status: 'not_applicable',
        deployedSourceHash: null,
        artifactHash: null,
      })
      expect(await readDeploymentSummary(harness.env, 4, 8)).toBeUndefined()
      expect(await readDeploymentSummary(harness.env, 3, 7)).toBeUndefined()
      expect(await readDeploymentSummary(harness.env, 404, 7)).toBeUndefined()
    })
  })
}
