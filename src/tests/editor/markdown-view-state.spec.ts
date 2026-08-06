import { describe, expect, it } from 'vitest'
import {
  clampSplitRatio,
  createMarkdownViewState,
  effectiveMarkdownViewMode,
} from '@/components/editor/markdown-view-state.svelte'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('editor Markdown view state', () => {
  it('defaults to Source and persists the requested workspace-wide mode and ratio', () => {
    const storage = new MemoryStorage()
    const state = createMarkdownViewState(storage)

    expect(state.requestedMode).toBe('source')
    expect(state.splitRatio).toBe(0.55)

    state.setRequestedMode('split')
    state.setSplitRatio(0.62, 1200)

    const restored = createMarkdownViewState(storage)
    expect(restored.requestedMode).toBe('split')
    expect(restored.splitRatio).toBe(0.62)
  })

  it('falls back to Source for Split below 720px without overwriting the request', () => {
    const storage = new MemoryStorage()
    const state = createMarkdownViewState(storage)
    state.setRequestedMode('split')

    expect(effectiveMarkdownViewMode({ requestedMode: state.requestedMode, renderer: 'markdown', contentWidth: 719, isMobile: false })).toBe('source')
    expect(state.requestedMode).toBe('split')
    expect(effectiveMarkdownViewMode({ requestedMode: state.requestedMode, renderer: 'markdown', contentWidth: 720, isMobile: false })).toBe('split')
  })

  it('allows only Source and Preview on mobile and only Markdown views for Markdown Files', () => {
    expect(effectiveMarkdownViewMode({ requestedMode: 'split', renderer: 'markdown', contentWidth: 1200, isMobile: true })).toBe('source')
    expect(effectiveMarkdownViewMode({ requestedMode: 'preview', renderer: 'markdown', contentWidth: 320, isMobile: true })).toBe('preview')
    expect(effectiveMarkdownViewMode({ requestedMode: 'preview', renderer: 'svelte', contentWidth: 1200, isMobile: false })).toBe('source')
  })

  it('clamps Split ratios so each effective pane is at least 320px wide', () => {
    expect(clampSplitRatio(0.1, 1000)).toBe(0.32)
    expect(clampSplitRatio(0.9, 1000)).toBeCloseTo(0.668)
    expect(clampSplitRatio(0.2, 600)).toBe(0.55)
  })

  it('preserves a valid wide-container Split ratio across workspace reloads', () => {
    const storage = new MemoryStorage()
    const state = createMarkdownViewState(storage)

    state.setSplitRatio(0.8, 2000)

    const restored = createMarkdownViewState(storage)
    expect(restored.splitRatio).toBe(0.8)
    expect(clampSplitRatio(restored.splitRatio, 2000)).toBe(0.8)
  })

  it('recovers from invalid storage without preventing editor startup', () => {
    const storage = new MemoryStorage()
    storage.setItem('koala-editor-markdown-view-v1', '{invalid')

    const state = createMarkdownViewState(storage)
    expect(state.requestedMode).toBe('source')
    expect(state.splitRatio).toBe(0.55)
  })

  it('falls back when persisted view state has an invalid ratio', () => {
    const storage = new MemoryStorage()
    storage.setItem('koala-editor-markdown-view-v1', JSON.stringify({
      schemaVersion: 1,
      mode: 'split',
      splitRatio: 1.2,
    }))

    const state = createMarkdownViewState(storage)
    expect(state.requestedMode).toBe('source')
    expect(state.splitRatio).toBe(0.55)
  })
})
