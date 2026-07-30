import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KOALA_PAGE_RUNTIME_MODULE_SOURCE } from '@/lib/svelte/page-runtime'

function runtimeModuleUrl() {
  return `data:text/javascript;base64,${Buffer.from(KOALA_PAGE_RUNTIME_MODULE_SOURCE).toString('base64')}`
}

describe('svelte page runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not mistake a missing companion file for an unauthenticated owner', async () => {
    const runtime = await import(runtimeModuleUrl())
    vi.stubGlobal('fetch', async () => new Response('[[]]', { status: 200 }))

    const error = await runtime.readOwnedMarkdown({ path: '/data/consume-list-catalog', prefix: '/data' })
      .then(() => null, error => error)

    expect(error).toBeInstanceOf(runtime.CompanionFileError)
    expect(error.message).toContain('/data/consume-list-catalog')
    expect(runtime.isOwnerAccessError(error)).toBe(false)
  })

  it('treats only an explicit Action UNAUTHORIZED response as an owner access error', async () => {
    const runtime = await import(runtimeModuleUrl())

    expect(runtime.isOwnerAccessError(new runtime.ActionError({ code: 'UNAUTHORIZED', status: 401 }))).toBe(true)
    expect(runtime.isOwnerAccessError(new runtime.ActionError({ code: 'NOT_FOUND', status: 404 }))).toBe(false)
  })
})
