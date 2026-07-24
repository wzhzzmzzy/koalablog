import { attach } from '@/actions/db/render-artifact'
import { UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  calculateArtifactHashes: vi.fn(),
  readById: vi.fn(),
  readCurrentRenderArtifact: vi.fn(),
  replaceCurrentRenderArtifact: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/markdown', () => ({ readById: mocks.readById }))
vi.mock('@/db/render-artifact', () => ({
  readCurrentRenderArtifact: mocks.readCurrentRenderArtifact,
  replaceCurrentRenderArtifact: mocks.replaceCurrentRenderArtifact,
}))
vi.mock('@/lib/svelte/artifact-hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/svelte/artifact-hash')>()
  return { ...actual, calculateArtifactHashes: mocks.calculateArtifactHashes }
})

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { role: 'admin' } } } as any
const sourceHash = 'a'.repeat(64)

function input(overrides: Record<string, unknown> = {}) {
  return {
    fileId: 7,
    schemaVersion: 1,
    renderer: 'svelte',
    svelteVersion: '5.19.2',
    unocssVersion: '65.4.3',
    unocssConfigHash: UNOCSS_CONFIG_HASH,
    sourceHash,
    dependencies: [],
    javascript: '({ mount() { return {}; }, unmount() {} })',
    css: '.page {}',
    snapshotHtml: '<p>Snapshot</p>',
    ...overrides,
  }
}

function currentFile(overrides: Record<string, unknown> = {}) {
  return { id: 7, renderer: 'svelte', sourceHash, ...overrides }
}

function currentArtifact(overrides: Record<string, unknown> = {}) {
  return {
    artifactHash: 'e'.repeat(64),
    dependencies: [{ url: 'https://example.test/module.js', bytes: 1, sha256: 'f'.repeat(64) }],
    ...overrides,
  }
}

describe('render Artifact attach action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readById.mockResolvedValue(currentFile())
    mocks.readCurrentRenderArtifact.mockResolvedValue(undefined)
    mocks.calculateArtifactHashes.mockResolvedValue({
      artifactHash: 'b'.repeat(64),
      javascriptResourceHash: 'c'.repeat(64),
      cssResourceHash: 'd'.repeat(64),
    })
    mocks.replaceCurrentRenderArtifact.mockImplementation(async (_env, artifact) => artifact)
  })

  it('authenticates, validates, calculates server-owned hashes, and attaches the Artifact', async () => {
    const result = await attach.orThrow.call(context, input())

    expect(mocks.authGuard).toHaveBeenCalledOnce()
    expect(mocks.readById).toHaveBeenCalledWith({ DB: 'db' }, 7)
    expect(mocks.calculateArtifactHashes).toHaveBeenCalledWith(input())
    expect(mocks.replaceCurrentRenderArtifact).toHaveBeenCalledWith(
      { DB: 'db' },
      expect.objectContaining({
        artifactHash: 'b'.repeat(64),
        javascriptResourceHash: 'c'.repeat(64),
        cssResourceHash: 'd'.repeat(64),
      }),
      null,
    )
    expect(result).toMatchObject({ artifactHash: 'b'.repeat(64) })
  })

  it('does not read or attach when authentication fails', async () => {
    mocks.authGuard.mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(attach.orThrow.call(context, input())).rejects.toThrow('Unauthorized')
    expect(mocks.readById).not.toHaveBeenCalled()
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })

  it('rejects missing, non-Svelte, and changed-Source Files without replacing the prior Artifact', async () => {
    mocks.readById.mockResolvedValueOnce(undefined)
    await expect(attach.orThrow.call(context, input())).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    mocks.readById.mockResolvedValueOnce(currentFile({ renderer: 'markdown' }))
    await expect(attach.orThrow.call(context, input())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'renderer_not_svelte' }),
    })

    mocks.readById.mockResolvedValueOnce(currentFile({ sourceHash: 'e'.repeat(64) }))
    await expect(attach.orThrow.call(context, input())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'source_hash_mismatch' }),
    })
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })

  it('rejects unsupported toolchains, non-canonical manifests, and executable Snapshots before replacement', async () => {
    await expect(attach.orThrow.call(context, input({ svelteVersion: '5.20.0' }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      status: 422,
      message: JSON.stringify({ code: 'unsupported_toolchain' }),
    })
    await expect(attach.orThrow.call(context, input({ dependencies: [
      { url: 'https://example.test/z.js', bytes: 1, sha256: 'b'.repeat(64) },
      { url: 'https://example.test/a.js', bytes: 1, sha256: 'c'.repeat(64) },
    ] }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      status: 422,
      message: JSON.stringify({ code: 'invalid_dependency_manifest' }),
    })
    await expect(attach.orThrow.call(context, input({ snapshotHtml: '<p onclick="alert(1)">Snapshot</p>' }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      status: 422,
      message: JSON.stringify({ code: 'invalid_snapshot' }),
    })
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })

  it('rejects oversize Artifacts and client-supplied hash fields without replacing the prior Artifact', async () => {
    await expect(attach.orThrow.call(context, input({ css: 'x'.repeat(200_001) }))).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      message: JSON.stringify({ code: 'artifact_too_large', field: 'css' }),
    })
    await expect(attach.orThrow.call(context, input({ artifactHash: 'f'.repeat(64) }))).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })

  it('reports a Source race without replacing the prior Artifact', async () => {
    mocks.replaceCurrentRenderArtifact.mockResolvedValueOnce(undefined)

    await expect(attach.orThrow.call(context, input())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'artifact_changed' }),
    })
  })

  it('returns a bounded dependency review instead of replacing a Current Artifact', async () => {
    mocks.readCurrentRenderArtifact.mockResolvedValueOnce(currentArtifact())

    const error = await attach.orThrow.call(context, input({ dependencies: [
      { url: 'https://example.test/added.js', bytes: 3, sha256: 'b'.repeat(64) },
      { url: 'https://example.test/module.js', bytes: 2, sha256: 'a'.repeat(64) },
    ] })).catch(error => error)
    expect(error).toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(JSON.parse(error.message)).toEqual({
      code: 'dependency_changed',
      currentArtifactHash: 'e'.repeat(64),
      proposedArtifactHash: 'b'.repeat(64),
      diff: {
        changes: [
          { kind: 'added', proposed: { url: 'https://example.test/added.js', bytes: 3, sha256: 'b'.repeat(64) }, url: 'https://example.test/added.js' },
          {
            kind: 'changed',
            previous: { url: 'https://example.test/module.js', bytes: 1, sha256: 'f'.repeat(64) },
            proposed: { url: 'https://example.test/module.js', bytes: 2, sha256: 'a'.repeat(64) },
            url: 'https://example.test/module.js',
          },
        ],
        truncated: false,
      },
    })
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })

  it('replaces only while an exact dependency confirmation still matches', async () => {
    mocks.readCurrentRenderArtifact.mockResolvedValueOnce(currentArtifact())

    await expect(attach.orThrow.call(context, input({
      dependencies: [{ url: 'https://example.test/module.js', bytes: 2, sha256: 'a'.repeat(64) }],
      confirmation: { currentArtifactHash: 'e'.repeat(64), proposedArtifactHash: 'b'.repeat(64) },
    }))).resolves.toMatchObject({ artifactHash: 'b'.repeat(64) })
    expect(mocks.replaceCurrentRenderArtifact).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'e'.repeat(64))
  })

  it('rejects stale dependency confirmation after Source, current Artifact, or proposed Artifact changes', async () => {
    const confirmation = { currentArtifactHash: 'e'.repeat(64), proposedArtifactHash: 'b'.repeat(64) }
    mocks.readById.mockResolvedValueOnce(currentFile({ sourceHash: 'c'.repeat(64) }))
    await expect(attach.orThrow.call(context, input({ confirmation }))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'dependency_confirmation_stale' }),
    })

    mocks.readCurrentRenderArtifact.mockResolvedValue(currentArtifact({ artifactHash: 'd'.repeat(64) }))
    await expect(attach.orThrow.call(context, input({ confirmation }))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'dependency_confirmation_stale' }),
    })

    mocks.readCurrentRenderArtifact.mockResolvedValue(currentArtifact({ dependencies: [] }))
    mocks.calculateArtifactHashes.mockResolvedValue({
      artifactHash: 'c'.repeat(64),
      javascriptResourceHash: 'c'.repeat(64),
      cssResourceHash: 'c'.repeat(64),
    })
    await expect(attach.orThrow.call(context, input({ confirmation }))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'dependency_confirmation_stale' }),
    })
    expect(mocks.replaceCurrentRenderArtifact).not.toHaveBeenCalled()
  })
})
