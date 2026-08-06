import type { RendererMode } from '@/lib/files/types'

export type MarkdownViewMode = 'source' | 'split' | 'preview'

export const MARKDOWN_VIEW_STORAGE_KEY = 'koala-editor-markdown-view-v1'
const MARKDOWN_VIEW_SCHEMA_VERSION = 1
const DEFAULT_SPLIT_RATIO = 0.55
const MIN_SPLIT_PANE_WIDTH = 320
const MIN_SPLIT_CONTENT_WIDTH = MIN_SPLIT_PANE_WIDTH * 2
const MIN_SPLIT_VIEWPORT_WIDTH = 720
export const SPLIT_SEPARATOR_WIDTH = 12

export interface MarkdownViewStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface MarkdownViewPreference {
  mode: MarkdownViewMode
  splitRatio: number
}

function browserStorage(): MarkdownViewStorage | null {
  if (typeof localStorage === 'undefined')
    return null
  return localStorage
}

function validMode(value: unknown): value is MarkdownViewMode {
  return value === 'source' || value === 'split' || value === 'preview'
}

function readPreference(storage: MarkdownViewStorage | null): MarkdownViewPreference {
  if (!storage)
    return { mode: 'source', splitRatio: DEFAULT_SPLIT_RATIO }
  try {
    const raw = storage.getItem(MARKDOWN_VIEW_STORAGE_KEY)
    if (!raw)
      return { mode: 'source', splitRatio: DEFAULT_SPLIT_RATIO }
    const value = JSON.parse(raw) as { schemaVersion?: unknown, mode?: unknown, splitRatio?: unknown }
    if (
      value.schemaVersion !== MARKDOWN_VIEW_SCHEMA_VERSION
      || !validMode(value.mode)
      || typeof value.splitRatio !== 'number'
      || !Number.isFinite(value.splitRatio)
      || value.splitRatio < 0
      || value.splitRatio > 1
    ) {
      return { mode: 'source', splitRatio: DEFAULT_SPLIT_RATIO }
    }
    return {
      mode: value.mode,
      // The saved value is a workspace preference. Pane constraints belong to
      // the currently measured container, not an arbitrary load-time width.
      splitRatio: value.splitRatio,
    }
  }
  catch {
    return { mode: 'source', splitRatio: DEFAULT_SPLIT_RATIO }
  }
}

export function clampSplitRatio(value: number, contentWidth: number) {
  if (!Number.isFinite(value) || contentWidth < MIN_SPLIT_CONTENT_WIDTH)
    return DEFAULT_SPLIT_RATIO
  const minimum = MIN_SPLIT_PANE_WIDTH / contentWidth
  const maximum = 1 - ((MIN_SPLIT_PANE_WIDTH + SPLIT_SEPARATOR_WIDTH) / contentWidth)
  return Math.min(maximum, Math.max(minimum, value))
}

export function effectiveMarkdownViewMode(input: {
  requestedMode: MarkdownViewMode
  renderer: RendererMode
  contentWidth: number
  isMobile: boolean
}): MarkdownViewMode {
  if (input.renderer !== 'markdown')
    return 'source'
  if (input.requestedMode !== 'split')
    return input.requestedMode
  if (input.isMobile || input.contentWidth < MIN_SPLIT_VIEWPORT_WIDTH)
    return 'source'
  return 'split'
}

export function createMarkdownViewState(storage: MarkdownViewStorage | null = browserStorage()) {
  const initial = readPreference(storage)
  let requestedMode = $state<MarkdownViewMode>(initial.mode)
  let splitRatio = $state(initial.splitRatio)

  function persist() {
    if (!storage)
      return
    try {
      storage.setItem(MARKDOWN_VIEW_STORAGE_KEY, JSON.stringify({
        schemaVersion: MARKDOWN_VIEW_SCHEMA_VERSION,
        mode: requestedMode,
        splitRatio,
      }))
    }
    catch {
      // Workspace view preferences must not block editing when storage is unavailable.
    }
  }

  return {
    get requestedMode() {
      return requestedMode
    },
    get splitRatio() {
      return splitRatio
    },
    setRequestedMode(mode: MarkdownViewMode) {
      requestedMode = mode
      persist()
    },
    setSplitRatio(value: number, contentWidth: number) {
      splitRatio = clampSplitRatio(value, contentWidth)
      persist()
    },
  }
}
