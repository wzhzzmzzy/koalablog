import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readEditorCounts, readEditorFile, readEditorPrefix } from '@/db/editor'
import { readEditorReferences, readEditorTags } from '@/db/editor-completion'
import { EDITOR_SEARCH_PAGE_SIZE, readEditorFilesById, searchEditorFiles } from '@/db/editor-search'
import { add } from '@/db/markdown'
import { ensureTemplateCatalogInitialized, replaceTemplateCatalog } from '@/db/template-catalog'

const env = {} as Env

function useEditorDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-editor-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        path text NOT NULL,
        title text NOT NULL,
        renderer text DEFAULT 'markdown' NOT NULL,
        content text NOT NULL,
        sourceHash text,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer,
        userId integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
      CREATE TABLE creation_template_catalog (
        key text PRIMARY KEY NOT NULL,
        schemaVersion integer NOT NULL,
        revision integer NOT NULL,
        payload text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })
}

describe('editor one-level reads', () => {
  useEditorDatabase()

  it('returns direct Files with Source and only immediate child Prefixes', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root Source', userId: 1 })
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside Source', userId: 1 })
    await add(env, { path: '/project/nested/deep', renderer: 'markdown', content: 'deep Source', userId: 1 })
    await add(env, { path: '/project/nested/deeper/hidden', renderer: 'markdown', content: 'hidden Source', userId: 1 })

    const root = await readEditorPrefix(env, '/', 1)
    expect(root.files.map(file => [file.path, file.content])).toEqual([['/root', 'root Source']])
    expect(root.prefixes).toEqual(['/project/'])
    expect(JSON.stringify(root)).not.toContain('deep Source')

    const project = await readEditorPrefix(env, '/project/', 1)
    expect(project.files.map(file => [file.path, file.content])).toEqual([['/project/inside', 'inside Source']])
    expect(project.prefixes).toEqual(['/project/nested/'])

    const nested = await readEditorPrefix(env, '/project/nested/', 1)
    expect(nested.files.map(file => file.path)).toEqual(['/project/nested/deep'])
    expect(nested.prefixes).toEqual(['/project/nested/deeper/'])
  })

  it('scopes all records, directory names and explicit lookups to the Owner', async () => {
    const [own] = await add(env, { path: '/mine/secret', renderer: 'markdown', content: 'private', private: true, userId: 1 })
    const [foreign] = await add(env, { path: '/foreign/public', renderer: 'markdown', content: 'foreign', private: false, userId: 2 })
    const [recycled] = await add(env, { path: '/recycled/old', renderer: 'markdown', content: 'old', deletedAt: new Date(), userId: 1 })
    const root = await readEditorPrefix(env, '/', 1)
    expect(root.files).toEqual([])
    expect(root.prefixes).toEqual(['/mine/'])
    expect(await readEditorCounts(env, 1)).toEqual({ active: 1, trash: 1 })
    expect(await readEditorFile(env, { path: own.path }, 1)).toMatchObject({ id: own.id })
    expect(await readEditorFile(env, { id: foreign.id }, 1)).toBeNull()
    expect(await readEditorFile(env, { path: foreign.path }, 1)).toBeNull()
    expect(await readEditorFile(env, { id: recycled.id }, 1)).toMatchObject({ deletedAt: expect.any(Date) })
    expect(await readEditorFile(env, { path: recycled.path }, 1)).toBeNull()
  })

  it('handles literal wildcards, Unicode, complete segments and canonical Prefixes', async () => {
    for (const path of ['/100%/😀/child/deep', '/100x/other', '/project_/child/file', '/projectX/other', '/😀/inside'])
      await add(env, { path, renderer: 'markdown', content: path, userId: 1 })
    expect((await readEditorPrefix(env, '/100%/', 1)).prefixes).toEqual(['/100%/😀/'])
    expect((await readEditorPrefix(env, '/100%/😀', 1)).prefixes).toEqual(['/100%/😀/child/'])
    expect((await readEditorPrefix(env, '/project_/', 1)).prefixes).toEqual(['/project_/child/'])
    expect((await readEditorPrefix(env, '/😀/', 1)).files.map(file => file.path)).toEqual(['/😀/inside'])
    await expect(readEditorPrefix(env, '/../', 1)).rejects.toThrow('Invalid editor Prefix')
  })

  it('projects template-only Prefixes one level at a time', async () => {
    const catalog = await ensureTemplateCatalogInitialized(env)
    await replaceTemplateCatalog(env, catalog.revision, [{
      id: 'deep',
      prefix: '/memo/inbox/archive/',
      renderer: 'markdown',
      titlePattern: 'note',
      pathPattern: '{{targetPrefix}}/{{title}}',
      content: '',
    }])
    expect((await readEditorPrefix(env, '/', 1)).prefixes).toEqual(['/memo/'])
    expect((await readEditorPrefix(env, '/memo/', 1)).prefixes).toEqual(['/memo/inbox/'])
    expect((await readEditorPrefix(env, '/memo/inbox/', 1)).prefixes).toEqual(['/memo/inbox/archive/'])
    expect((await readEditorPrefix(env, '/memo/inbox/archive/', 1)).prefixes).toEqual([])
  })

  it('searches unopened Files by literal Path, Tag and Source in bounded pages', async () => {
    for (let index = 0; index < EDITOR_SEARCH_PAGE_SIZE + 3; index++)
      await add(env, { path: `/unopened/file-${index}`, renderer: 'markdown', content: 'search-needle', userId: 1 })
    await add(env, { path: '/other/private', renderer: 'markdown', content: 'search-needle', userId: 2 })
    await add(env, { path: '/old/deleted', renderer: 'markdown', content: 'search-needle', userId: 1, deletedAt: new Date() })
    const first = await searchEditorFiles(env, 1, 'SEARCH-NEEDLE')
    expect(first.files).toHaveLength(EDITOR_SEARCH_PAGE_SIZE)
    expect(first.nextOffset).toBe(EDITOR_SEARCH_PAGE_SIZE)
    const second = await searchEditorFiles(env, 1, 'search-needle', first.nextOffset!)
    expect(second.files).toHaveLength(3)
    expect(second.nextOffset).toBeNull()
    expect(new Set([...first.files, ...second.files].map(file => file.id)).size).toBe(EDITOR_SEARCH_PAGE_SIZE + 3)
    expect((await searchEditorFiles(env, 1, 'unopened')).files).toHaveLength(EDITOR_SEARCH_PAGE_SIZE)
    await add(env, { path: '/tagged', renderer: 'markdown', content: '#100_percent', userId: 1 })
    expect((await searchEditorFiles(env, 1, '100_percent')).files.map(file => file.path)).toEqual(['/tagged'])
    expect((await searchEditorFiles(env, 1, '%')).files).toEqual([])
    expect(await searchEditorFiles(env, 1, ' ')).toEqual({ files: [], nextOffset: null })
  })

  it('resolves requested recents and completion metadata without foreign or recycled Files', async () => {
    const [own] = await add(env, { path: '/unopened/100%_file', renderer: 'markdown', content: '#shared-tag\n#shared-tag', userId: 1 })
    await add(env, { path: '/elsewhere/100xyfile', renderer: 'markdown', content: '#shared-tag', userId: 1 })
    const [foreign] = await add(env, { path: '/foreign/file', renderer: 'markdown', content: '#foreign-tag', userId: 2 })
    const [deleted] = await add(env, { path: '/old/file', renderer: 'markdown', content: '#deleted-tag', userId: 1, deletedAt: new Date() })
    expect((await readEditorFilesById(env, 1, [own.id, foreign.id, deleted.id])).map(file => file.id)).toEqual([own.id])
    expect(await readEditorFilesById(env, 1, [])).toEqual([])
    const references = await readEditorReferences(env, 1, '100%_')
    expect(references).toHaveLength(1)
    expect(references[0]).toMatchObject({ id: own.id, path: own.path, updatedAt: expect.any(Date) })
    expect(references[0]).not.toHaveProperty('content')
    const tags = await readEditorTags(env, 1, 'TAG')
    expect(tags).toEqual([{ tag: 'shared-tag', fileCount: 2, updatedAt: expect.any(Date) }])
  })
})
