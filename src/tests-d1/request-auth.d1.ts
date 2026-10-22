import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeExistingInstallation } from '@/db/installation'
import { authInterceptor } from '@/lib/auth'
import { hashApiToken } from '@/lib/auth/api-token'
import { createSession } from '@/lib/auth/session'
import { GET, PUT } from '@/pages/api/sync/files/[id]'
import baselineSchema from '../../migrations/0000_init.sql?raw'
import userSchema from '../../migrations/0002_user.sql?raw'

beforeEach(async () => {
  for (const table of ['api_token', 'markdown_render', 'markdown', 'user', 'creation_template_catalog', 'oss_access', 'blob_storage'])
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run()
  for (const migration of [baselineSchema, userSchema]) {
    for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean))
      await env.DB.prepare(statement).run()
  }
  await env.DB.prepare(`INSERT INTO user(id,username,passwordHash,passwordSalt,role) VALUES
    (7,'owner','hash','salt','member'), (8,'other','hash','salt','admin')`).run()
  await env.DB.prepare('INSERT INTO api_token(userId,tokenHash) VALUES(?,?)').bind(7, await hashApiToken('owner-token')).run()
  await env.DB.prepare(`INSERT INTO markdown(id,source,path,title,content,sourceHash,userId,revision) VALUES
    (3,30,'/memo/owned','owned','original','original-hash',7,4),
    (4,30,'/memo/other','other','private','other-hash',8,1)`).run()
  await env.KOALA.put('_KoalaConfig_', JSON.stringify({ _runtime: { ready: true }, auth: {} }))
})

function context({ id = '3', method = 'GET', token = 'owner-token', sessionId, body }: { id?: string, method?: string, token?: string, sessionId?: string, body?: unknown } = {}) {
  const prepare = vi.fn((query: string) => env.DB.prepare(query))
  const request = new Request(`https://koala.test/api/sync/files/${id}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return {
    prepare,
    ctx: {
      request,
      url: new URL(request.url),
      params: { id },
      cookies: { get: () => sessionId ? { value: sessionId } : undefined },
      locals: { runtime: { env: { ...env, DB: { prepare } } } },
    } as any,
  }
}

describe('request authentication with D1', () => {
  it('uses exactly three SELECTs across middleware authentication and an owned File GET', async () => {
    const { ctx, prepare } = context()
    await authInterceptor(ctx)
    const response = await GET(ctx)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ file: { id: 3, revision: 4, content: 'original' } })
    expect(prepare).toHaveBeenCalledTimes(3)
    expect(prepare.mock.calls.every(([query]) => query.startsWith('select '))).toBe(true)
  })

  it('keeps a cached Owner unable to read or update another Owner File', async () => {
    const read = context({ id: '4' })
    await authInterceptor(read.ctx)
    expect((await GET(read.ctx)).status).toBe(404)
    const write = context({ id: '4', method: 'PUT', body: { path: '/memo/other', renderer: 'markdown', content: 'overwrite', baseRevision: 1 } })
    await authInterceptor(write.ctx)
    expect((await PUT(write.ctx)).status).toBe(404)
    expect(await env.DB.prepare('SELECT content,revision FROM markdown WHERE id = 4').first()).toEqual({ content: 'private', revision: 1 })
  })

  it('retains revision CAS after cached authentication', async () => {
    const { ctx } = context({ method: 'PUT', body: { path: '/memo/owned', renderer: 'markdown', content: 'stale overwrite', baseRevision: 3 } })
    await authInterceptor(ctx)
    const response = await PUT(ctx)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'source_conflict', file: { revision: 4 } })
    expect(await env.DB.prepare('SELECT content,sourceHash,revision FROM markdown WHERE id = 3').first()).toEqual({ content: 'original', sourceHash: 'original-hash', revision: 4 })
  })

  it('rejects an invalid Bearer after middleware resolved a valid Session', async () => {
    const sessionId = await createSession(env, { userId: 8, role: 'admin' })
    const { ctx, prepare } = context({ token: 'wrong', sessionId })
    await authInterceptor(ctx)
    expect(ctx.locals.session.userId).toBe(8)
    expect((await GET(ctx)).status).toBe(401)
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('initializes an existing installation only through the explicit operation', async () => {
    expect(await env.DB.prepare('SELECT count(*) AS count FROM creation_template_catalog').first('count')).toBe(0)
    const { ctx } = context()
    await authInterceptor(ctx)
    await GET(ctx)
    expect(await env.DB.prepare('SELECT count(*) AS count FROM creation_template_catalog').first('count')).toBe(0)
    await initializeExistingInstallation(env)
    await initializeExistingInstallation(env)
    expect(await env.DB.prepare('SELECT count(*) AS count FROM creation_template_catalog').first('count')).toBe(1)
    expect(await env.DB.prepare('SELECT count(*) AS count FROM user').first('count')).toBe(2)
  })
})
