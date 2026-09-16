import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KOALA_PAGE_RUNTIME_MODULE_SOURCE } from '@/lib/svelte/page-runtime'

function runtimeModuleUrl() {
  return `data:text/javascript;base64,${Buffer.from(KOALA_PAGE_RUNTIME_MODULE_SOURCE).toString('base64')}`
}

function fileResponse(privateFile: boolean, canEdit = false) {
  return new Response(JSON.stringify([
    [1],
    { id: 2, path: 3, renderer: 4, private: 5, revision: 6, content: 7, canEdit: 8 },
    7,
    '/data/plan',
    'markdown',
    privateFile,
    3,
    'shared settings',
    canEdit,
  ]))
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

  it('reads public Markdown using an explicit public scope with server-provided edit permission', async () => {
    const runtime = await import(runtimeModuleUrl())
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => fileResponse(false))
    vi.stubGlobal('fetch', fetch)
    const file = await runtime.readMarkdown({ path: '/data/plan', prefix: '/data', scope: 'public' })
    expect(file).toMatchObject({ content: 'shared settings', private: false, canEdit: false })
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ prefix: '/data', scope: 'public' })
  })

  it('allows an Owner to read either public or private Markdown through the compatible helper', async () => {
    const runtime = await import(runtimeModuleUrl())
    for (const privateFile of [true, false]) {
      vi.stubGlobal('fetch', async () => fileResponse(privateFile))
      await expect(runtime.readOwnedMarkdown({ path: '/data/plan', prefix: '/data' }))
        .resolves
        .toMatchObject({ private: privateFile, canEdit: true })
    }
  })

  it('rejects private records returned to a public read and invalid scope arguments', async () => {
    const runtime = await import(runtimeModuleUrl())
    const fetch = vi.fn(async () => fileResponse(true))
    vi.stubGlobal('fetch', fetch)
    await expect(runtime.readMarkdown({ path: '/data/plan', prefix: '/data', scope: 'public' }))
      .rejects
      .toBeInstanceOf(runtime.CompanionFileError)
    fetch.mockClear()
    await expect(runtime.readMarkdown({ path: '/data/plan', prefix: '/data', scope: 'all' }))
      .rejects
      .toBeInstanceOf(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves public visibility on Owner Save and adopts the new revision', async () => {
    const runtime = await import(runtimeModuleUrl())
    let form: FormData | undefined
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      form = init?.body as FormData
      return new Response(JSON.stringify([
        { id: 1, path: 2, renderer: 3, private: 4, revision: 5, content: 6 },
        7,
        '/data/plan',
        'markdown',
        false,
        4,
        'new shared settings',
      ]))
    })
    const saved = await runtime.saveOwnedMarkdown({ id: 7, path: '/data/plan', renderer: 'markdown', private: false, revision: 3, content: 'old', canEdit: true }, 'new shared settings')
    expect(form?.get('private')).toBe('false')
    expect(form?.get('baseRevision')).toBe('3')
    expect(saved).toMatchObject({ private: false, revision: 4, canEdit: true })
  })

  it('does not attempt a Save for a known read-only public File', async () => {
    const runtime = await import(runtimeModuleUrl())
    const fetch = vi.fn(async () => fileResponse(false))
    vi.stubGlobal('fetch', fetch)
    await expect(runtime.saveOwnedMarkdown({ id: 7, path: '/data/plan', renderer: 'markdown', private: false, revision: 3, content: 'old', canEdit: false }, 'visitor changes'))
      .rejects
      .toMatchObject({ code: 'FORBIDDEN' })
    expect(fetch).not.toHaveBeenCalled()
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
