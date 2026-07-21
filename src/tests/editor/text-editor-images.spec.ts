import { findImageRemoval, findImageReplacement, prepareImageBatch } from '@/components/editor/text-editor/images'
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
  it('filters non-images and creates one ordered placeholder batch', () => {
    const ids = ['first-id', 'second-id']
    const batch = prepareImageBatch([
      image('first.png'),
      image('notes.txt', 'text/plain'),
      image('second].png'),
    ], () => ids.shift()!)

    expect(batch.items).toHaveLength(2)
    expect(batch.text).toBe([
      '![Uploading first.png…](koala-upload:first-id)',
      '![Uploading second .png…](koala-upload:second-id)',
    ].join('\n'))
  })

  it('replaces and removes only the exact matching placeholder', () => {
    const [first, second] = prepareImageBatch([
      image('same.png'),
      image('same.png'),
    ], (() => {
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
    const [pending] = prepareImageBatch([image('gone.png')], () => 'gone-id').items
    const source = 'user kept this text'

    expect(findImageReplacement(source, pending, '/api/oss/gone')).toBeNull()
    expect(findImageRemoval(source, pending)).toBeNull()
  })
})
