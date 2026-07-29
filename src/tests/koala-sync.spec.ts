import { access, mkdtemp, readFile, rename, rm, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { synchronizeOnce } from '../../scripts/koala/sync.mjs'
import { initializeWorkspace, readSyncState } from '../../scripts/koala/workspace.mjs'

const directories: string[] = []
const hash = (value: string) => value.padEnd(64, '0').slice(0, 64)

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'koala-sync-'))
  directories.push(root)
  await initializeWorkspace(root)
  return root
}

function file(path: string, revision = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    path,
    renderer: 'markdown',
    sourceHash: hash(`source-${revision}`),
    revision,
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  }
}

function client(manifest: { files?: any[], attachments?: any[] }) {
  return {
    manifest: vi.fn().mockResolvedValue({ files: [], attachments: [], ...manifest }),
    createFile: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    getFile: vi.fn(),
    putAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    getAttachment: vi.fn(),
  }
}

afterEach(async () => Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('one-shot local workspace synchronization', () => {
  it('creates private remote Source through the client and writes only minimal state', async () => {
    const root = await workspace()
    await writeFile(join(root, 'note.md'), '# Local')
    const remote = file('/note')
    const remoteClient = client({})
    remoteClient.createFile.mockResolvedValue(remote)

    const result = await synchronizeOnce(root, remoteClient)

    expect(result.created).toEqual(['/note'])
    expect(remoteClient.createFile).toHaveBeenCalledWith({ path: '/note', renderer: 'markdown', content: '# Local' })
    expect((await readSyncState(root)).files['/note']).toMatchObject({ id: 1, revision: 1, sourceHash: remote.sourceHash })
  })

  it('pulls an unknown remote File without interpreting it as a local deletion', async () => {
    const root = await workspace()
    const remote = file('/from-dashboard', 4, { renderer: 'svelte', sourceHash: hash('dashboard') })
    const remoteClient = client({ files: [remote] })
    remoteClient.getFile.mockResolvedValue({ ...remote, content: '<h1>Dashboard</h1>' })

    const result = await synchronizeOnce(root, remoteClient)

    expect(result.pulled).toEqual(['/from-dashboard'])
    expect(result.rebuildRequired).toEqual(['/from-dashboard'])
    expect(await readFile(join(root, 'from-dashboard.svelte'), 'utf8')).toBe('<h1>Dashboard</h1>')
    expect((await readSyncState(root)).files['/from-dashboard']).toMatchObject({ id: 1, revision: 4 })
  })

  it('uses remote Source when timestamps tie and does not create a conflict copy', async () => {
    const root = await workspace()
    const path = join(root, 'note.md')
    await writeFile(path, 'initial')
    const initial = file('/note')
    const remoteClient = client({})
    remoteClient.createFile.mockResolvedValue(initial)
    await synchronizeOnce(root, remoteClient)

    const timestamp = new Date('2026-07-29T02:03:04.000Z')
    await writeFile(path, 'local revision')
    await utimes(path, timestamp, timestamp)
    const remote = file('/note', 2, { sourceHash: hash('remote'), updatedAt: timestamp.toISOString() })
    remoteClient.manifest.mockResolvedValue({ files: [remote], attachments: [] })
    remoteClient.getFile.mockResolvedValue({ ...remote, content: 'remote revision' })

    const result = await synchronizeOnce(root, remoteClient)

    expect(result.pulled).toEqual(['/note'])
    expect(remoteClient.updateFile).not.toHaveBeenCalled()
    expect(await readFile(path, 'utf8')).toBe('remote revision')
  })

  it('propagates explicit local removal as an online trash operation and accepts partial retry', async () => {
    const root = await workspace()
    await writeFile(join(root, 'one.md'), 'one')
    await writeFile(join(root, 'two.md'), 'two')
    const remoteClient = client({})
    remoteClient.createFile.mockImplementation(({ path }) => path === '/one'
      ? Promise.resolve(file(path))
      : Promise.reject(new Error('temporary network failure')))

    const partial = await synchronizeOnce(root, remoteClient)
    expect(partial.created).toEqual(['/one'])
    expect(partial.failed).toEqual([{ path: '/two', error: 'temporary network failure' }])
    expect(Object.keys((await readSyncState(root)).files)).toEqual(['/one'])

    await unlink(join(root, 'one.md'))
    const remote = file('/one')
    remoteClient.manifest.mockResolvedValue({ files: [remote], attachments: [] })
    remoteClient.deleteFile.mockResolvedValue({})
    const removed = await synchronizeOnce(root, remoteClient)
    expect(removed.removed).toEqual(['/one'])
    expect(remoteClient.deleteFile).toHaveBeenCalledWith(1, 1)
  })

  it('removes local Source when its tracked remote File has already been removed', async () => {
    const root = await workspace()
    const path = join(root, 'note.md')
    await writeFile(path, 'local')
    const remoteClient = client({})
    remoteClient.createFile.mockResolvedValue(file('/note'))
    await synchronizeOnce(root, remoteClient)
    remoteClient.manifest.mockResolvedValue({ files: [], attachments: [] })

    const result = await synchronizeOnce(root, remoteClient)

    expect(result.removed).toEqual(['/note'])
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains online identity when a Source is renamed inside the filesystem', async () => {
    const root = await workspace()
    await writeFile(join(root, 'old.md'), 'content')
    const initial = file('/old')
    const remoteClient = client({})
    remoteClient.createFile.mockResolvedValue(initial)
    await synchronizeOnce(root, remoteClient)
    await rename(join(root, 'old.md'), join(root, 'renamed.md'))
    remoteClient.manifest.mockResolvedValue({ files: [initial], attachments: [] })
    const saved = file('/renamed', 2, { sourceHash: hash('renamed') })
    remoteClient.updateFile.mockResolvedValue(saved)

    const result = await synchronizeOnce(root, remoteClient)

    expect(result.renamed).toEqual(['/old -> /renamed'])
    expect(remoteClient.updateFile).toHaveBeenCalledWith(1, expect.objectContaining({ path: '/renamed', baseRevision: 1 }))
    expect((await readSyncState(root)).files).toEqual(expect.objectContaining({ '/renamed': expect.objectContaining({ id: 1, revision: 2 }) }))
    expect((await readSyncState(root)).files['/old']).toBeUndefined()
  })

  it('uploads, downloads, and deletes Attachments independently from Source', async () => {
    const root = await workspace()
    await writeFile(join(root, 'attachments', 'local.png'), 'local bytes')
    const remoteClient = client({})
    remoteClient.putAttachment.mockResolvedValue({ path: 'local.png', size: 11, etag: 'first', updatedAt: '2026-07-29T01:00:00.000Z' })
    const uploaded = await synchronizeOnce(root, remoteClient)
    expect(uploaded.attachments.uploaded).toEqual(['local.png'])

    await unlink(join(root, 'attachments', 'local.png'))
    const remote = { path: 'local.png', size: 11, etag: 'first', updatedAt: '2026-07-29T01:00:00.000Z' }
    remoteClient.manifest.mockResolvedValue({ files: [], attachments: [remote] })
    remoteClient.deleteAttachment.mockResolvedValue({})
    const removed = await synchronizeOnce(root, remoteClient)
    expect(removed.attachments.removed).toEqual(['local.png'])

    const dashboardAttachment = { path: 'dashboard.pdf', size: 9, etag: 'dashboard', updatedAt: '2026-07-29T02:00:00.000Z' }
    remoteClient.manifest.mockResolvedValue({ files: [], attachments: [dashboardAttachment] })
    remoteClient.getAttachment.mockResolvedValue(new TextEncoder().encode('dashboard'))
    const downloaded = await synchronizeOnce(root, remoteClient)
    expect(downloaded.attachments.downloaded).toEqual(['dashboard.pdf'])
    expect(await readFile(join(root, 'attachments', 'dashboard.pdf'), 'utf8')).toBe('dashboard')
  })
})
