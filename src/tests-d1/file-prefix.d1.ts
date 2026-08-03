import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { add, readByPrefix, readVisiblePathPrefix } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

describe('D1 File Prefix refresh', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
  })

  it('returns only Files directly under the Prefix', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root', userId: 1 })
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside', userId: 1 })
    await add(env, { path: '/project/nested/deep', renderer: 'markdown', content: 'deep', userId: 1 })
    await add(env, { path: '/project/nested/deeper/hidden', renderer: 'markdown', content: 'hidden', userId: 1 })

    const rootFiles = await readByPrefix(env, '/')
    const projectFiles = await readByPrefix(env, '/project/')

    expect(rootFiles.map(file => file.path).sort()).toEqual([
      '/root',
    ])
    expect(projectFiles.map(file => file.path).sort()).toEqual([
      '/project/inside',
    ])
  })

  it('builds a visible one-level listing without exposing private descendants', async () => {
    await add(env, { path: '/memos/public', renderer: 'markdown', content: '', userId: 1 })
    await add(env, { path: '/memos/private-owner', renderer: 'markdown', content: '', private: true, userId: 1 })
    await add(env, { path: '/memos/inbox/today', renderer: 'markdown', content: '', userId: 2 })
    await add(env, { path: '/memos/hidden/secret', renderer: 'markdown', content: '', private: true, userId: 2 })

    const anonymous = await readVisiblePathPrefix(env, '/memos/')
    expect(anonymous.files.map(file => file.path)).toEqual(['/memos/public'])
    expect(anonymous.prefixes).toEqual(['/memos/inbox/'])

    const owner = await readVisiblePathPrefix(env, '/memos/', 1)
    expect(owner.files.map(file => file.path)).toEqual([
      '/memos/private-owner',
      '/memos/public',
    ])
    expect(owner.prefixes).toEqual(['/memos/inbox/'])
  })
})
