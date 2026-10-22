import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { connectDB } from '@/db'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { readArtifactAccess, replaceRenderArtifact } from '@/db/render-artifact'
import { markdown } from '@/db/schema'
import { GET as getModule } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/module.js'
import { GET as getStyles } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/styles.css'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

const sourceHash = 'a'.repeat(64)

function instrumentedEnv() {
  const statements: string[] = []
  const binding = new Proxy(env.DB, {
    get(target, key) {
      if (key === 'prepare') {
        return (query: string) => {
          statements.push(query)
          return target.prepare(query)
        }
      }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { statements, environment: { ...env, DB: binding } }
}

describe('D1 Artifact delivery projections', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
    await connectDB(env).insert(markdown).values({
      id: 1,
      path: '/page/test',
      title: 'test',
      source: 30,
      renderer: 'svelte',
      content: 'large source '.repeat(10000),
      sourceHash,
      private: false,
      userId: 7,
    })
    await replaceRenderArtifact(env, {
      fileId: 1,
      schemaVersion: 1,
      renderer: 'svelte',
      svelteVersion: '5',
      unocssVersion: '65',
      unocssConfigHash: 'config',
      sourceHash,
      artifactHash: 'artifact',
      javascriptResourceHash: 'js',
      cssResourceHash: 'css',
      javascript: '({ mount() {}, unmount() {} })',
      css: '.test {}',
      snapshotHtml: '<p>Snapshot</p>',
      dependencies: [],
    })
  })

  it.each([getModule, getStyles])('returns 304 after one metadata query with no body fields', async (handler) => {
    const { statements, environment } = instrumentedEnv()
    const response = await handler({
      params: { fileId: '1', sourceHash },
      request: new Request('https://koala.test/resource', { headers: { 'If-None-Match': '*' } }),
      locals: { runtime: { env: environment }, session: { userId: null } },
    } as any)
    expect(response.status).toBe(304)
    expect(statements).toHaveLength(1)
    expect(statements[0]).not.toMatch(/"(?:content|javascript|css|snapshotHtml|dependencies)"/)
  })

  it.each([[getModule, 'javascript'], [getStyles, 'css']] as const)('fetches only %s representation on a cache miss', async (handler, field) => {
    const { statements, environment } = instrumentedEnv()
    const response = await handler({
      params: { fileId: '1', sourceHash },
      request: new Request('https://koala.test/resource'),
      locals: { runtime: { env: environment }, session: { userId: null } },
    } as any)
    expect(response.status).toBe(200)
    await response.text()
    expect(statements).toHaveLength(2)
    expect(statements[1].split(' from ')[0]).toBe(`select "markdown_render"."${field}"`)
  })

  it('loads only the Snapshot for HTML delivery', async () => {
    const { statements, environment } = instrumentedEnv()
    expect((await readArtifactAccess(environment, { fileId: 1, representation: 'page' })).artifact?.snapshotHtml).toBe('<p>Snapshot</p>')
    expect(statements).toHaveLength(2)
    expect(statements[1].split(' from ')[0]).toBe('select "markdown_render"."snapshotHtml"')
  })

  it('refuses a matching cached validator after the File becomes private', async () => {
    await connectDB(env).run('UPDATE markdown SET private = 1')
    const { statements, environment } = instrumentedEnv()
    const response = await getModule({
      params: { fileId: '1', sourceHash },
      request: new Request('https://koala.test/resource', { headers: { 'If-None-Match': '*' } }),
      locals: { runtime: { env: environment }, session: { userId: 8 } },
    } as any)
    expect(response.status).toBe(404)
    expect(response.headers.get('ETag')).toBeNull()
    expect(statements).toHaveLength(1)
  })
})
