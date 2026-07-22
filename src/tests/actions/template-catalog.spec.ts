import { read, replace } from '@/actions/db/templates'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  readTemplateCatalog: vi.fn(),
  replaceTemplateCatalog: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/template-catalog', () => ({
  readTemplateCatalog: mocks.readTemplateCatalog,
  replaceTemplateCatalog: mocks.replaceTemplateCatalog,
}))

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { role: 'admin' } } } as any
const template = {
  id: 'memo-default',
  prefix: '/memo/',
  titlePattern: '{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}',
  pathPattern: '{{targetPrefix}}/{{title}}',
  content: '',
}

describe('template Catalog actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the explicit stored Catalog state for an admin', async () => {
    const stored = {
      status: 'ready',
      catalog: { schemaVersion: 2, revision: 3, templates: [{ ...template, renderer: 'markdown' }] },
    }
    mocks.readTemplateCatalog.mockResolvedValue(stored)

    await expect(read.orThrow.call(context, {})).resolves.toEqual({
      status: 'ready',
      catalog: { schemaVersion: 1, revision: 3, templates: [template] },
    })
    expect(mocks.authGuard).toHaveBeenCalledOnce()
    expect(mocks.readTemplateCatalog).toHaveBeenCalledWith({ DB: 'db' })
  })

  it('saves large Template Content independently at the supplied Catalog revision', async () => {
    const largeTemplate = { ...template, content: 'x'.repeat(100_000) }
    const storedCatalog = {
      schemaVersion: 2,
      revision: 4,
      templates: [{ ...largeTemplate, renderer: 'markdown' }],
    }
    mocks.replaceTemplateCatalog.mockResolvedValue({ status: 'saved', catalog: storedCatalog })

    await expect(replace.orThrow.call(context, { baseRevision: 3, templates: [largeTemplate] })).resolves.toEqual({
      schemaVersion: 1,
      revision: 4,
      templates: [largeTemplate],
    })
    expect(mocks.replaceTemplateCatalog).toHaveBeenCalledWith({ DB: 'db' }, 3, [{
      ...largeTemplate,
      renderer: 'markdown',
    }])
  })

  it('returns HTTP 409 template_catalog_conflict for a stale revision', async () => {
    mocks.replaceTemplateCatalog.mockResolvedValue({ status: 'conflict', currentRevision: 4 })

    await expect(replace.orThrow.call(context, { baseRevision: 3, templates: [] })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'template_catalog_conflict', currentRevision: 4 }),
    })
  })

  it('rejects fields outside Template v1 before storage', async () => {
    await expect(replace.orThrow.call(context, {
      baseRevision: 3,
      templates: [{ ...template, renderer: 'svelte' }],
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.replaceTemplateCatalog).not.toHaveBeenCalled()
  })

  it('does not read the Catalog when authentication fails', async () => {
    mocks.authGuard.mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(read.orThrow.call(context, {})).rejects.toThrow('Unauthorized')
    expect(mocks.readTemplateCatalog).not.toHaveBeenCalled()
  })
})
