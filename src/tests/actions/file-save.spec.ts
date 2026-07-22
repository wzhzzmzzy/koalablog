import { save } from '@/actions/form/markdown'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  saveFile: vi.fn(),
  updatePrivate: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/markdown', () => ({
  FileInputError: class FileInputError extends Error {},
  saveFile: mocks.saveFile,
  updatePrivate: mocks.updatePrivate,
}))

const context = { locals: { runtime: { env: {} }, session: { role: 'admin' } } } as any

function validForm() {
  const form = new FormData()
  form.set('id', '7')
  form.set('path', '/post/example')
  form.set('content', 'local Source')
  form.set('private', 'false')
  form.set('baseRevision', '3')
  return form
}

describe('file Save action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an independently supplied Title before calling the database', async () => {
    const form = validForm()
    form.set('title', 'Independent Title')

    await expect(save.orThrow.call(context, form)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.saveFile).not.toHaveBeenCalled()
  })

  it('rejects ID-zero Save creation after server File creation is available', async () => {
    const form = validForm()
    form.set('id', '0')

    await expect(save.orThrow.call(context, form)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.saveFile).not.toHaveBeenCalled()
  })

  it('normalizes multipart line endings before saving Source', async () => {
    const form = validForm()
    form.set('content', 'first\r\nsecond\rthird')
    mocks.saveFile.mockResolvedValue({ status: 'saved', file: { id: 7 } })

    await save.orThrow.call(context, form)

    expect(mocks.saveFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      renderer: 'markdown',
      content: 'first\nsecond\nthird',
    }))
  })

  it('passes an explicit Svelte Renderer to the database Save', async () => {
    const form = validForm()
    form.set('renderer', 'svelte')
    mocks.saveFile.mockResolvedValue({ status: 'saved', file: { id: 7 } })

    await save.orThrow.call(context, form)

    expect(mocks.saveFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      renderer: 'svelte',
    }))
  })

  it('surfaces a stale base revision as HTTP 409 source_conflict with current values', async () => {
    const current = {
      id: 7,
      path: '/post/example',
      title: 'example',
      content: 'server Source',
      revision: 4,
    }
    mocks.saveFile.mockResolvedValue({ status: 'conflict', current })

    await expect(save.orThrow.call(context, validForm())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'source_conflict', current }),
    })
  })
})
