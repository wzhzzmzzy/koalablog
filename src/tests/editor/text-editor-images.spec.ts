import { findImageRemoval, findImageReplacement, imageMarkup, prepareImageBatch } from '@/components/editor/text-editor/images'
import { RENDERER_MODE } from '@/lib/files/types'
import { describe, expect, it } from 'vitest'

function image(name: string, type = 'image/png') {
  return { name, type } as File
}

function applyChange(source: string, change: { from: number, to: number, insert: string } | null) {
  if (!change)
    return source
  return source.slice(0, change.from) + change.insert + source.slice(change.to)
}

describe('text Editor image batches', () => {
  it('formats final image markup for the selected Renderer', () => {
    expect(imageMarkup(RENDERER_MODE.Markdown, '/api/oss/image.png'))
      .toBe('![](/api/oss/image.png)')
    expect(imageMarkup(RENDERER_MODE.Svelte, '/api/oss/image"&<{}.png'))
      .toBe('<img src="/api/oss/image&quot;&amp;&lt;&#123;&#125;.png" alt="" />')
  })

  it('filters non-images and creates one ordered placeholder batch', () => {
    const ids = ['first-id', 'second-id']
    const batch = prepareImageBatch([
      image('first.png'),
      image('notes.txt', 'text/plain'),
      image('second].png'),
    ], RENDERER_MODE.Markdown, () => ids.shift()!)

    expect(batch.items).toHaveLength(2)
    expect(batch.text).toBe([
      '![Uploading first.png…](koala-upload:first-id)',
      '![Uploading second .png…](koala-upload:second-id)',
    ].join('\n'))
  })

  it('captures Svelte for the placeholder and final replacement', () => {
    const [pending] = prepareImageBatch(
      [image('hero"&<{}.png')],
      RENDERER_MODE.Svelte,
      () => 'svelte-id',
    ).items

    expect(pending.renderer).toBe(RENDERER_MODE.Svelte)
    expect(pending.placeholder)
      .toBe('<img src="koala-upload:svelte-id" alt="Uploading hero&quot;&amp;&lt;&#123;&#125;.png…" />')
    expect(applyChange(
      pending.placeholder,
      findImageReplacement(pending.placeholder, pending, '/api/oss/hero.png'),
    )).toBe('<img src="/api/oss/hero.png" alt="" />')
  })

  it('replaces and removes only the exact matching placeholder', () => {
    const [first, second] = prepareImageBatch([
      image('same.png'),
      image('same.png'),
    ], RENDERER_MODE.Markdown, (() => {
      let id = 0
      return () => `id-${++id}`
    })()).items
    const source = `${first.placeholder}\nkeep\n${second.placeholder}`

    const afterSuccess = applyChange(source, findImageReplacement(source, second, '/api/oss/second'))
    expect(afterSuccess).toBe(`${first.placeholder}\nkeep\n![](/api/oss/second)`)

    const afterFailure = applyChange(afterSuccess, findImageRemoval(afterSuccess, first))
    expect(afterFailure).toBe('\nkeep\n![](/api/oss/second)')
  })

  it('discards a late upload result after the user removes its placeholder', () => {
    const [pending] = prepareImageBatch([image('gone.png')], RENDERER_MODE.Markdown, () => 'gone-id').items
    const source = 'user kept this text'

    expect(findImageReplacement(source, pending, '/api/oss/gone')).toBeNull()
    expect(findImageRemoval(source, pending)).toBeNull()
  })
})
