import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { exportExchange, importExchange } from '../../scripts/koala/exchange.mjs'
import { initializeWorkspace } from '../../scripts/koala/workspace.mjs'

const directories: string[] = []

async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'koala-exchange-'))
  directories.push(root)
  return root
}

afterEach(async () => Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('content-only exchange', () => {
  it('exports Source and Attachments while excluding synchronization state', async () => {
    const root = await directory()
    await initializeWorkspace(root)
    await writeFile(join(root, 'notes.md'), '# Notes')
    await writeFile(join(root, 'widget.svelte'), '<h1>Widget</h1>')
    await writeFile(join(root, 'attachments', 'diagram.png'), 'binary')
    await writeFile(join(root, '.koala', 'secret.txt'), 'not portable')
    const archive = join(root, 'exchange.zip')

    const result = await exportExchange(root, archive)
    const contents = unzipSync(new Uint8Array(await readFile(archive)))

    expect(result).toMatchObject({ files: ['/notes', '/widget'], attachments: ['diagram.png'] })
    expect(Object.keys(contents).sort()).toEqual(['attachments/diagram.png', 'notes.md', 'widget.svelte'])
    expect(strFromU8(contents['notes.md'])).toBe('# Notes')
  })

  it('imports only new paths, preserves binary bytes, and reports Svelte rebuilding', async () => {
    const source = await directory()
    const target = await directory()
    await initializeWorkspace(target)
    await writeFile(join(target, 'notes.md'), 'existing')
    const archive = join(source, 'content.zip')
    await writeFile(archive, zipSync({
      'notes.md': strToU8('replacement is not allowed'),
      'widgets/demo.svelte': strToU8('<h1>Demo</h1>'),
      'attachments/report.pdf': new Uint8Array([0, 1, 2, 255]),
      '.koala/sync-state.json': strToU8('{"should":"not import"}'),
      'unsupported.txt': strToU8('skip'),
    }))

    const result = await importExchange(target, archive)

    expect(result).toMatchObject({
      created: ['/widgets/demo'],
      skippedExisting: ['/notes'],
      skippedInvalid: expect.arrayContaining(['.koala/sync-state.json', 'unsupported.txt']),
      rebuildRequired: ['/widgets/demo'],
      attachments: { created: ['report.pdf'] },
    })
    expect(await readFile(join(target, 'notes.md'), 'utf8')).toBe('existing')
    expect(await readFile(join(target, 'widgets', 'demo.svelte'), 'utf8')).toBe('<h1>Demo</h1>')
    expect([...await readFile(join(target, 'attachments', 'report.pdf'))]).toEqual([0, 1, 2, 255])
  })
})
