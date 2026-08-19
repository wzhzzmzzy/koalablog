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
      .then(() => null, (error: unknown) => error)

    expect(error).toBeInstanceOf(runtime.CompanionFileError)
    expect(error.message).toContain('/data/consume-list-catalog')
    expect(runtime.isOwnerAccessError(error)).toBe(false)
  })

  it('treats only an explicit Action UNAUTHORIZED response as an owner access error', async () => {
    const runtime = await import(runtimeModuleUrl())

    expect(runtime.isOwnerAccessError(new runtime.ActionError({ code: 'UNAUTHORIZED', status: 401 }))).toBe(true)
    expect(runtime.isOwnerAccessError(new runtime.ActionError({ code: 'NOT_FOUND', status: 404 }))).toBe(false)
  })

  it('adopts canonical content and revision returned by companion Markdown Save', async () => {
    const runtime = await import(runtimeModuleUrl())
    let submitted: FormData | null = null
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      submitted = init?.body as FormData
      return new Response(JSON.stringify([
        { id: 1, path: 2, renderer: 3, private: 4, deletedAt: -1, revision: 5, content: 6 },
        7,
        '/data/tags',
        'markdown',
        true,
        3,
        '---\ntags: ["body"]\n---\n\n#body',
      ]), { status: 200 })
    })

    const saved = await runtime.saveOwnedMarkdown({
      id: 7,
      path: '/data/tags',
      renderer: 'markdown',
      private: true,
      deletedAt: null,
      revision: 2,
      content: '#old',
    }, '#body')

    expect(submitted).toBeInstanceOf(FormData)
    const submittedForm = submitted as FormData | null
    expect(submittedForm?.get('content')).toBe('#body')
    expect(submittedForm?.get('baseRevision')).toBe('2')
    expect(saved).toMatchObject({
      revision: 3,
      content: '---\ntags: ["body"]\n---\n\n#body',
    })
  })
})
