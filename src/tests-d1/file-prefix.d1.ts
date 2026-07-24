import { add, readByPrefix } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import initSql from '../../migrations/0000_init.sql?raw'

describe('D1 File Prefix refresh', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql])
  })

  it('returns only Files directly under the Prefix', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root' })
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside' })
    await add(env, { path: '/project/nested/deep', renderer: 'markdown', content: 'deep' })
    await add(env, { path: '/project/nested/deeper/hidden', renderer: 'markdown', content: 'hidden' })

    const rootFiles = await readByPrefix(env, '/')
    const projectFiles = await readByPrefix(env, '/project/')

    expect(rootFiles.map(file => file.path).sort()).toEqual([
      '/root',
    ])
    expect(projectFiles.map(file => file.path).sort()).toEqual([
      '/project/inside',
    ])
  })
})
