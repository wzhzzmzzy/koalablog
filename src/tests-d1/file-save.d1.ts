import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAnyById, readByPath, saveFile } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

describe('D1 File Renderer replacement', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
  })

  it('atomically trashes the old File and creates the new Renderer File', async () => {
    const markdownFile = await saveFile(env, {
      id: 0,
      path: '/page/application',
      renderer: 'markdown',
      content: 'old Markdown Source',
      private: true,
      baseRevision: 0,
      userId: 1,
    })
    if (markdownFile.status !== 'saved')
      throw new Error('Expected Markdown fixture creation to succeed')

    const replacement = await saveFile(env, {
      id: markdownFile.file.id,
      path: markdownFile.file.path,
      renderer: 'svelte',
      content: '<h1>new Svelte Source</h1>',
      private: markdownFile.file.private,
      baseRevision: markdownFile.file.revision,
      userId: 1,
    })

    expect(replacement).toMatchObject({ status: 'saved', file: { renderer: 'svelte', revision: 1 } })
    if (replacement.status !== 'saved')
      throw new Error('Expected Renderer replacement to succeed')
    expect(replacement.file.id).not.toBe(markdownFile.file.id)
    expect(await readAnyById(env, markdownFile.file.id)).toMatchObject({ renderer: 'markdown', deletedAt: expect.any(Date) })
    expect(await readByPath(env, '/page/application')).toMatchObject({ id: replacement.file.id, renderer: 'svelte' })
  })
})
