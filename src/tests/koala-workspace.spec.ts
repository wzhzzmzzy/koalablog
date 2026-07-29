import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeWorkspace, instantSearch, readSyncState, scanWorkspace, sourceHash } from '../../scripts/koala/workspace.mjs'

const directories: string[] = []

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'koala-workspace-'))
  directories.push(directory)
  await initializeWorkspace(directory)
  return directory
}

afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

describe('local Workspace primitives', () => {
  it('initializes only minimal sync state and scans Source plus the Attachment Root', async () => {
    const root = await workspace()
    await writeFile(join(root, 'note.md'), '# Sync policy')
    await writeFile(join(root, 'widget.svelte'), '<h1>Widget</h1>')
    await writeFile(join(root, 'attachments', 'diagram.png'), 'png')
    await writeFile(join(root, '.koala', 'ignored.md'), 'ignored')
    const scanned = await scanWorkspace(root)
    expect(scanned.files.map(file => [file.path, file.renderer])).toEqual([
      ['/note', 'markdown'],
      ['/widget', 'svelte'],
    ])
    expect(scanned.attachments.map(file => file.path)).toEqual(['diagram.png'])
    expect(await readSyncState(root)).toEqual({ version: 1, files: {}, attachments: {} })
  })

  it('uses the canonical persisted Source hash and direct Source/Attachment search', async () => {
    const root = await workspace()
    await writeFile(join(root, 'note.md'), '# Sync policy\nA local workspace')
    await writeFile(join(root, 'attachments', 'policy.pdf'), 'pdf')
    expect(sourceHash('markdown', 'source')).toMatch(/^[a-f0-9]{64}$/)
    expect(await instantSearch(root, 'policy')).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/note' }),
      expect.objectContaining({ path: '/attachments/policy.pdf' }),
    ]))
  })
})
