import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { MarkdownSource } from '@/db'
import { add, readByPath, readList } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'
import artifactSchemaSql from '../../migrations/0003_artifact_objects.sql?raw'

describe('D1 Memo list filtering', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql, artifactSchemaSql])
  })

  it('excludes /data at a case-sensitive Path boundary before applying year, tag and visibility filters', async () => {
    const createdAt = new Date('2026-10-21T00:00:00.000Z')
    for (const path of ['/data', '/data/news-feed/latest', '/data/yingji/objects/example', '/database/note', '/Data/note', '/memo/note']) {
      await add(env, { path, renderer: 'markdown', content: '#note', userId: 1, createdAt })
    }
    await add(env, { path: '/data/private', renderer: 'markdown', content: '#note', userId: 1, private: true, createdAt })
    await add(env, { path: '/memo/private', renderer: 'markdown', content: '#note', userId: 1, private: true, createdAt })
    await add(env, { path: '/memo/other-owner', renderer: 'markdown', content: '#note', userId: 2, private: true, createdAt })
    await add(env, { path: '/memo/other-tag', renderer: 'markdown', content: '#other', userId: 1, createdAt })
    await add(env, { path: '/memo/other-year', renderer: 'markdown', content: '#note', userId: 1, createdAt: new Date('2025-10-21T00:00:00.000Z') })

    const publicPaths = ['/Data/note', '/database/note', '/memo/note']
    expect((await readList(env, MarkdownSource.Memo, 'note', { year: 2026 })).map(file => file.path).sort())
      .toEqual(publicPaths)
    expect((await readList(env, MarkdownSource.Memo, 'note', { ownerId: 1, year: 2026 })).map(file => file.path).sort())
      .toEqual([...publicPaths, '/memo/private'])
    expect(await readByPath(env, '/data/news-feed/latest'))
      .toMatchObject({ path: '/data/news-feed/latest', source: MarkdownSource.Memo, private: false })
  })
})
