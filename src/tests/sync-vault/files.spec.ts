import { describe, expect, it } from 'vitest'
import {
  assertUniqueSourcePaths,
  rendererFromDiskPath,
  sourceContentForUpload,
  sourceFromVaultPath,
  SyncRenderer,
  vaultPathForSource,
} from '../../../scripts/sync-vault/files.js'

describe('sync-vault source file semantics', () => {
  it('derives Renderer only from the final disk extension and writes matching pull paths', () => {
    expect(rendererFromDiskPath('/vault/page/widget.svelte')).toBe('svelte')
    expect(rendererFromDiskPath('/vault/page/note.md')).toBe('markdown')
    expect(sourceFromVaultPath('/vault', '/vault/page/widget.svelte')).toEqual({ path: '/page/widget', renderer: 'svelte' })
    expect(sourceFromVaultPath('/vault', '/vault/page/note.md')).toEqual({ path: '/page/note', renderer: 'markdown' })
    expect(vaultPathForSource('/vault', '/page/widget', SyncRenderer.Svelte)).toBe('/vault/page/widget.svelte')
    expect(vaultPathForSource('/vault', '/page/note')).toBe('/vault/page/note.md')
  })

  it('rejects cross-extension duplicates before an upload batch starts', () => {
    expect(() => assertUniqueSourcePaths([
      { path: '/wiki/same', renderer: 'markdown' },
      { path: '/wiki/same', renderer: 'svelte' },
    ])).toThrow('Multiple vault Files map to File Path: /wiki/same')
  })

  it('does not apply Markdown attachment rewriting to Svelte Source', () => {
    const source = '<img src="../../attachments/diagram.png">\n![[../../attachments/diagram.png]]'
    expect(sourceContentForUpload({ content: source, renderer: SyncRenderer.Svelte })).toBe(source)
    expect(sourceContentForUpload({ content: source, renderer: SyncRenderer.Markdown })).toContain('![](/attachments/diagram.png)')
  })
})
