import { serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
import { GET as getModule } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/module.js'
import { GET as getStyles } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/styles.css'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readArtifactAccess: vi.fn(),
}))

vi.mock('@/db/render-artifact', () => ({
  readArtifactAccess: mocks.readArtifactAccess,
}))

const sourceHash = 'a'.repeat(64)
const javascript = '({ mount(target) { target.textContent = "Koala" }, unmount() {} })'
const css = ':where([data-koala-artifact-root]) .koala { color: teal; }'
const artifact = {
  css,
  cssResourceHash: 'c'.repeat(64),
  javascript,
  javascriptResourceHash: 'j'.repeat(64),
}

function allowed(cacheControl: 'private, no-store' | 'public, no-cache' = 'public, no-cache') {
  return {
    artifact,
    decision: { cacheControl, status: 200 as const, type: 'allowed' as const },
  }
}

function denied() {
  return {
    decision: { cacheControl: 'no-store' as const, status: 404 as const, type: 'not_found' as const },
  }
}

function createContext(path: string, headers?: HeadersInit, role = '') {
  const request = new Request(`https://koala.test${path}`, { headers })
  const [, fileId, sourceHashParam] = path.match(/^\/api\/render-artifacts\/([^/]+)\/([^/]+)\//) || []
  return {
    params: { fileId, sourceHash: sourceHashParam },
    request,
    locals: {
      runtime: { env: { DB: 'db' } },
      session: { role },
    },
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readArtifactAccess.mockResolvedValue(allowed())
})

describe('render Artifact resource API', () => {
  it('serves the exact serialized public module bytes with its independent ETag', async () => {
    const response = await getModule(createContext(`/api/render-artifacts/17/${sourceHash}/module.js`))

    expect(response.status).toBe(200)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'cache-control': 'public, no-cache',
      'content-type': 'text/javascript; charset=utf-8',
      'etag': `"koala-js-v1-sha256-${artifact.javascriptResourceHash}"`,
      'x-content-type-options': 'nosniff',
    })
    expect(await response.text()).toBe(serializeJavascriptResource(javascript))
    expect(mocks.readArtifactAccess).toHaveBeenCalledWith({ DB: 'db' }, {
      authenticated: false,
      fileId: 17,
      representation: 'resource',
      requestedSourceHash: sourceHash,
    })
  })

  it('serves the exact stored public CSS bytes with its own ETag', async () => {
    const response = await getStyles(createContext(`/api/render-artifacts/17/${sourceHash}/styles.css`))

    expect(response.status).toBe(200)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'cache-control': 'public, no-cache',
      'content-type': 'text/css; charset=utf-8',
      'etag': `"koala-css-v1-sha256-${artifact.cssResourceHash}"`,
      'x-content-type-options': 'nosniff',
    })
    expect(await response.text()).toBe(css)
  })

  it('matches a public validator list only after the current access check succeeds', async () => {
    const etag = `"koala-js-v1-sha256-${artifact.javascriptResourceHash}"`
    const response = await getModule(createContext(`/api/render-artifacts/17/${sourceHash}/module.js`, {
      'If-None-Match': `"unrelated", W/${etag}`,
    }))

    expect(response.status).toBe(304)
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('ETag')).toBe(etag)
    expect(await response.text()).toBe('')
    expect(mocks.readArtifactAccess).toHaveBeenCalledTimes(1)
  })

  it('never returns 304 or an ETag for authorized private resources', async () => {
    mocks.readArtifactAccess.mockResolvedValue(allowed('private, no-store'))

    const response = await getStyles(createContext(`/api/render-artifacts/17/${sourceHash}/styles.css`, {
      'If-None-Match': '*',
    }, 'guest'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('ETag')).toBeNull()
    expect(await response.text()).toBe(css)
    expect(mocks.readArtifactAccess).toHaveBeenCalledWith({ DB: 'db' }, expect.objectContaining({ authenticated: true }))
  })

  it('rechecks public-to-private, trash, restore, and purge state before returning any resource bytes', async () => {
    let state: 'private' | 'purged' | 'public' | 'trashed' = 'private'
    mocks.readArtifactAccess.mockImplementation(() => {
      if (state === 'public')
        return Promise.resolve(allowed())
      if (state === 'private')
        return Promise.resolve(denied())
      return Promise.resolve(denied())
    })

    const path = `/api/render-artifacts/17/${sourceHash}/module.js`
    const publicToPrivate = await getModule(createContext(path, { 'If-None-Match': '*' }))
    state = 'trashed'
    const trashed = await getModule(createContext(path))
    state = 'public'
    const restored = await getModule(createContext(path))
    state = 'purged'
    const purged = await getModule(createContext(path))

    for (const response of [publicToPrivate, trashed, purged]) {
      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('ETag')).toBeNull()
      expect(await response.text()).toBe('')
    }
    expect(restored.status).toBe(200)
    expect(restored.headers.get('ETag')).toBe(`"koala-js-v1-sha256-${artifact.javascriptResourceHash}"`)
    expect(await restored.text()).toBe(serializeJavascriptResource(javascript))
  })

  it('conceals stale and malformed URLs without looking up or returning an Artifact', async () => {
    mocks.readArtifactAccess.mockResolvedValue(denied())
    const stale = await getStyles(createContext(`/api/render-artifacts/17/${'b'.repeat(64)}/styles.css`))
    const malformed = await getStyles(createContext('/api/render-artifacts/not-a-number/not-a-hash/styles.css'))

    expect(stale.status).toBe(404)
    expect(stale.headers.get('Cache-Control')).toBe('no-store')
    expect(stale.headers.get('ETag')).toBeNull()
    expect(await stale.text()).toBe('')
    expect(malformed.status).toBe(404)
    expect(malformed.headers.get('Cache-Control')).toBe('no-store')
    expect(malformed.headers.get('ETag')).toBeNull()
    expect(await malformed.text()).toBe('')
    expect(mocks.readArtifactAccess).toHaveBeenCalledTimes(1)
    expect(mocks.readArtifactAccess).toHaveBeenCalledWith({ DB: 'db' }, expect.objectContaining({ requestedSourceHash: 'b'.repeat(64) }))
  })
})
