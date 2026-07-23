import { reconcileTextEditorDiagnostics } from '@/components/editor/text-editor/diagnostics'
import { isCurrentTextEditorLanguageRequest, planTextEditorLanguageRequest } from '@/components/editor/text-editor/language-state'
import { createEditorStateRegistry, reconcileEditorInput } from '@/components/editor/text-editor/state-registry'
import { describe, expect, it, vi } from 'vitest'

interface FakeEditorState {
  doc: string
  interaction: string
}

describe('text Editor state registry', () => {
  it('restores cached interaction state only when the accepted Source matches', () => {
    const registry = createEditorStateRegistry<FakeEditorState>(state => state.doc)
    const cached = { doc: 'accepted Source', interaction: 'selection and undo' }
    const create = vi.fn((doc: string) => ({ doc, interaction: 'fresh' }))

    registry.save(1, cached)

    expect(registry.restore(1, 'accepted Source', create)).toEqual({
      state: cached,
      restored: true,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('drops stale cached state when the accepted Source differs', () => {
    const registry = createEditorStateRegistry<FakeEditorState>(state => state.doc)
    const create = vi.fn((doc: string) => ({ doc, interaction: 'fresh' }))

    registry.save(1, { doc: 'stale Source', interaction: 'stale undo' })

    expect(registry.restore(1, 'server Source', create)).toEqual({
      state: { doc: 'server Source', interaction: 'fresh' },
      restored: false,
    })
    expect(create).toHaveBeenCalledOnce()

    registry.save(1, { doc: 'server Source', interaction: 'new undo' })
    expect(registry.restore(1, 'server Source', create).restored).toBe(true)
  })

  it('discards one File without disturbing another File cache', () => {
    const registry = createEditorStateRegistry<FakeEditorState>(state => state.doc)
    const create = (doc: string) => ({ doc, interaction: 'fresh' })
    const second = { doc: 'second', interaction: 'kept' }

    registry.save(1, { doc: 'first', interaction: 'discarded' })
    registry.save(2, second)
    registry.discard(1)
    registry.save(1, { doc: 'first', interaction: 'late save from mounted editor' })

    expect(registry.restore(1, 'first', create).restored).toBe(false)
    expect(registry.restore(2, 'second', create)).toEqual({ state: second, restored: true })
  })
})

describe('text Editor input reconciliation', () => {
  it('switches by File ID, ignores equal echoes, and replaces different accepted Source', () => {
    expect(reconcileEditorInput(1, 'Source', 2, 'Source')).toBe('switch')
    expect(reconcileEditorInput(1, 'Source', 1, 'Source')).toBe('noop')
    expect(reconcileEditorInput(1, 'Source', 1, 'replacement')).toBe('replace')
  })
})

describe('text Editor dynamic configuration', () => {
  it('requests only missing languages and rejects work invalidated by a restored File state', () => {
    const sveltePlan = planTextEditorLanguageRequest(0, 'markdown', 'svelte', false)
    expect(sveltePlan).toEqual({
      latestRequestId: 1,
      request: { requestId: 1, renderer: 'svelte' },
    })
    expect(isCurrentTextEditorLanguageRequest(sveltePlan.request!, 1, 'svelte')).toBe(true)

    const restoredMarkdownPlan = planTextEditorLanguageRequest(1, 'markdown', 'markdown', true)
    expect(restoredMarkdownPlan).toEqual({ latestRequestId: 2, request: null })
    expect(isCurrentTextEditorLanguageRequest(sveltePlan.request!, 2, 'markdown')).toBe(false)
  })

  it('replaces diagnostics by request ID and rejects stale updates', () => {
    const current = {
      requestId: 4,
      diagnostics: [{ from: 0, to: 6, severity: 'error' as const, message: 'current' }],
    }

    expect(reconcileTextEditorDiagnostics(current, {
      requestId: 3,
      diagnostics: [{ from: 0, to: 1, severity: 'warning', message: 'stale' }],
    })).toBeNull()
    expect(reconcileTextEditorDiagnostics(current, {
      requestId: 5,
      diagnostics: [{ from: 1, to: 2, severity: 'info', message: 'replacement' }],
    })).toEqual({
      requestId: 5,
      diagnostics: [{ from: 1, to: 2, severity: 'info', message: 'replacement' }],
    })
  })
})
