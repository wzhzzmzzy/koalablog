import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attach, status } from '@/actions/db/render-artifact'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  calculateArtifactHashes: vi.fn(),
  readById: vi.fn(),
  readDeployedRenderArtifact: vi.fn(),
  readDeploymentSummary: vi.fn(),
  replaceDeployedRenderArtifact: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ loginGuard: mocks.authGuard }))
vi.mock('@/db/markdown', () => ({ readById: mocks.readById }))
vi.mock('@/db/render-artifact', () => ({
  readDeployedRenderArtifact: mocks.readDeployedRenderArtifact,
  readDeploymentSummary: mocks.readDeploymentSummary,
  replaceDeployedRenderArtifact: mocks.replaceDeployedRenderArtifact,
}))
vi.mock('@/lib/svelte/artifact-hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/svelte/artifact-hash')>()
  return { ...actual, calculateArtifactHashes: mocks.calculateArtifactHashes }
})

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { userId: 1, role: 'admin' } } } as any
const sourceHash = 'a'.repeat(64)

function input(overrides: Record<string, unknown> = {}) {
  return {
    fileId: 7,
    schemaVersion: 1 as const,
    renderer: 'svelte' as const,
    svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
    unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
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
  return { id: 7, renderer: 'svelte', sourceHash, userId: 1, ...overrides }
}

function currentArtifact(overrides: Record<string, unknown> = {}) {
  return {
    artifactHash: 'e'.repeat(64),
    dependencies: [{ url: 'https://example.test/module.js', bytes: 1, sha256: 'f'.repeat(64) }],
    sourceHash,
    ...overrides,
  }
}

describe('render Artifact attach action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readById.mockResolvedValue(currentFile())
    mocks.readDeployedRenderArtifact.mockResolvedValue(undefined)
    mocks.calculateArtifactHashes.mockResolvedValue({
      artifactHash: 'b'.repeat(64),
      javascriptResourceHash: 'c'.repeat(64),
      cssResourceHash: 'd'.repeat(64),
    })
    mocks.replaceDeployedRenderArtifact.mockImplementation(async (_env, artifact) => artifact)
  })

  it('authenticates, validates, calculates server-owned hashes, and attaches the Artifact', async () => {
    const result = await attach.orThrow.call(context, input())

    expect(mocks.authGuard).toHaveBeenCalledOnce()
    expect(mocks.readById).toHaveBeenCalledWith({ DB: 'db' }, 7)
    expect(mocks.calculateArtifactHashes).toHaveBeenCalledWith(input())
    expect(mocks.replaceDeployedRenderArtifact).toHaveBeenCalledWith(
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
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
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
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
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
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
  })

  it('rejects oversize Artifacts and client-supplied hash fields without replacing the prior Artifact', async () => {
    await expect(attach.orThrow.call(context, input({ css: 'x'.repeat(200_001) }))).rejects.toMatchObject({
      code: 'CONTENT_TOO_LARGE',
      status: 413,
      message: JSON.stringify({ code: 'artifact_too_large', field: 'css' }),
    })
    await expect(attach.orThrow.call(context, input({ artifactHash: 'f'.repeat(64) }))).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
  })

  it('reports a Source race without replacing the prior Artifact', async () => {
    mocks.replaceDeployedRenderArtifact.mockResolvedValueOnce(undefined)

    await expect(attach.orThrow.call(context, input())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'artifact_changed' }),
    })
  })

  it('replaces a prior deployed Source without requiring dependency confirmation', async () => {
    mocks.readDeployedRenderArtifact.mockResolvedValueOnce(currentArtifact({
      dependencies: [{ url: 'https://example.test/old.js', bytes: 1, sha256: 'd'.repeat(64) }],
      sourceHash: 'f'.repeat(64),
    }))

    await expect(attach.orThrow.call(context, input({
      dependencies: [{ url: 'https://example.test/new.js', bytes: 1, sha256: 'e'.repeat(64) }],
    }))).resolves.toMatchObject({ artifactHash: 'b'.repeat(64) })
    expect(mocks.replaceDeployedRenderArtifact).toHaveBeenCalledWith(expect.anything(), expect.anything(), null)
  })

  it('returns a bounded dependency review instead of replacing a Current Artifact', async () => {
    mocks.readDeployedRenderArtifact.mockResolvedValueOnce(currentArtifact())

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
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
  })

  it('replaces only while an exact dependency confirmation still matches', async () => {
    mocks.readDeployedRenderArtifact.mockResolvedValueOnce(currentArtifact())

    await expect(attach.orThrow.call(context, input({
      dependencies: [{ url: 'https://example.test/module.js', bytes: 2, sha256: 'a'.repeat(64) }],
      confirmation: { currentArtifactHash: 'e'.repeat(64), proposedArtifactHash: 'b'.repeat(64) },
    }))).resolves.toMatchObject({ artifactHash: 'b'.repeat(64) })
    expect(mocks.replaceDeployedRenderArtifact).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'e'.repeat(64))
  })

  it('rejects stale dependency confirmation after Source, current Artifact, or proposed Artifact changes', async () => {
    const confirmation = { currentArtifactHash: 'e'.repeat(64), proposedArtifactHash: 'b'.repeat(64) }
    mocks.readById.mockResolvedValueOnce(currentFile({ sourceHash: 'c'.repeat(64) }))
    await expect(attach.orThrow.call(context, input({ confirmation }))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'dependency_confirmation_stale' }),
    })

    mocks.readDeployedRenderArtifact.mockResolvedValue(currentArtifact({ artifactHash: 'd'.repeat(64) }))
    await expect(attach.orThrow.call(context, input({ confirmation }))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'dependency_confirmation_stale' }),
    })

    mocks.readDeployedRenderArtifact.mockResolvedValue(currentArtifact({ dependencies: [] }))
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
    expect(mocks.replaceDeployedRenderArtifact).not.toHaveBeenCalled()
  })

  it('returns only the owner-authorized deployment summary', async () => {
    const summary = {
      status: 'deployment_drift' as const,
      deployedSourceHash: 'b'.repeat(64),
      artifactHash: 'c'.repeat(64),
    }
    mocks.readDeploymentSummary.mockResolvedValueOnce(summary)

    await expect(status.orThrow.call(context, { fileId: 7 })).resolves.toEqual(summary)
    expect(mocks.readDeploymentSummary).toHaveBeenCalledWith({ DB: 'db' }, 7, 1)

    mocks.readDeploymentSummary.mockResolvedValueOnce(undefined)
    await expect(status.orThrow.call(context, { fileId: 7 })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
})
