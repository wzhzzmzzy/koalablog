import type { FileRecord } from '@/db/types'
import { onMount } from 'svelte'

export interface WorkspaceHistoryState {
  koalaWorkspaceHistory: 1
  fileId: number | null
  index: number
}

interface WorkspaceHistory {
  currentState: () => unknown
  currentUrl: () => URL
  pushState: (state: WorkspaceHistoryState, url: URL) => void
  replaceState: (state: WorkspaceHistoryState, url: URL) => void
  back: () => void
  navigate: (url: string) => void
  listen: (listener: (state: unknown) => void) => () => void
}

interface WorkspaceLifecycle {
  register: (callback: () => void | (() => void)) => void
}

interface WorkspaceNavigationOptions {
  initialFile: FileRecord | null
  getFiles: () => readonly FileRecord[]
  getCurrentFile: () => FileRecord | null
  select: (file: FileRecord | null) => void
  isMobile: () => boolean
  closeSidebar: () => void
  recordRecent?: (fileId: number) => void
  dashboardUrl: (file: FileRecord | null) => string
  focusIntent?: (intent: 'source') => void
  history?: WorkspaceHistory
  lifecycle?: WorkspaceLifecycle
}

export interface WorkspaceNavigation {
  open: (file: FileRecord) => void
  back: () => void
}

function workspaceState(file: FileRecord | null, index: number): WorkspaceHistoryState {
  return {
    koalaWorkspaceHistory: 1,
    fileId: file?.id ?? null,
    index,
  }
}

function readWorkspaceState(value: unknown): WorkspaceHistoryState | null {
  if (!value || typeof value !== 'object')
    return null
  const state = value as Partial<WorkspaceHistoryState>
  if (state.koalaWorkspaceHistory !== 1 || typeof state.index !== 'number' || !Number.isInteger(state.index) || state.index < 0)
    return null
  if (state.fileId !== null && (typeof state.fileId !== 'number' || !Number.isInteger(state.fileId) || state.fileId <= 0))
    return null
  return state as WorkspaceHistoryState
}

function browserHistory(): WorkspaceHistory {
  return {
    currentState: () => window.history.state,
    currentUrl: () => new URL(window.location.href),
    pushState(state, url) {
      window.history.pushState(state, '', `${url.pathname}${url.search}${url.hash}`)
    },
    replaceState(state, url) {
      window.history.replaceState(state, '', `${url.pathname}${url.search}${url.hash}`)
    },
    back: () => window.history.back(),
    navigate: url => window.location.assign(url),
    listen(listener) {
      const handlePopstate = (event: PopStateEvent) => listener(event.state)
      window.addEventListener('popstate', handlePopstate)
      return () => window.removeEventListener('popstate', handlePopstate)
    },
  }
}

/**
 * Owns the browser-history representation of the selected File. Its public
 * surface is intentionally restricted to open/back so callers cannot create
 * parallel path stacks or synthesize unsupported workspace views.
 */
export function createWorkspaceNavigation(options: WorkspaceNavigationOptions): WorkspaceNavigation {
  const history = options.history ?? (typeof window === 'undefined' ? null : browserHistory())
  let historyIndex = 0
  let started = false

  function canonicalUrl(file: FileRecord | null) {
    if (!history)
      return new URL('http://localhost/dashboard/edit')
    const url = history.currentUrl()
    url.searchParams.delete('path')
    url.searchParams.delete('id')
    if (file?.deletedAt)
      url.searchParams.set('id', String(file.id))
    else if (file)
      url.searchParams.set('path', file.path)
    return url
  }

  function replace(file: FileRecord | null, index = historyIndex) {
    if (!history)
      return
    historyIndex = index
    history.replaceState(workspaceState(file, historyIndex), canonicalUrl(file))
  }

  function select(file: FileRecord | null, optionsForSelection: { recordRecent: boolean, closeMobileSidebar: boolean }) {
    options.select(file)
    if (!file)
      return
    if (!file.deletedAt && optionsForSelection.recordRecent)
      options.recordRecent?.(file.id)
    if (optionsForSelection.closeMobileSidebar && options.isMobile())
      options.closeSidebar()
    options.focusIntent?.('source')
  }

  function canonicalizeCurrent() {
    if (!history || !started)
      return
    const current = options.getCurrentFile()
    const currentState = readWorkspaceState(history.currentState())
    const url = canonicalUrl(current)
    const expected = workspaceState(current, currentState?.index ?? historyIndex)
    const urlChanged = `${url.pathname}${url.search}${url.hash}` !== `${history.currentUrl().pathname}${history.currentUrl().search}${history.currentUrl().hash}`
    if (urlChanged || currentState?.fileId !== expected.fileId || currentState.index !== expected.index)
      replace(current, expected.index)
  }

  function resolve(fileId: number | null) {
    if (fileId === null)
      return null
    return options.getFiles().find(file => file.id === fileId) ?? null
  }

  function handlePopstate(value: unknown) {
    const state = readWorkspaceState(value)
    if (!state)
      return
    historyIndex = state.index
    const file = resolve(state.fileId)
    if (file) {
      select(file, { recordRecent: true, closeMobileSidebar: true })
      replace(file, state.index)
      return
    }

    const current = options.getCurrentFile()
    const currentIsAuthorized = current !== null && options.getFiles().some(file => file.id === current.id)
    const fallback = currentIsAuthorized
      ? current
      : options.getFiles().find(file => !file.deletedAt) ?? null
    select(fallback, { recordRecent: false, closeMobileSidebar: true })
    replace(fallback, state.index)
  }

  function start() {
    if (!history || started)
      return
    started = true
    const initial = options.initialFile ?? options.getCurrentFile()
    replace(initial, 0)
    if (initial && !initial.deletedAt)
      options.recordRecent?.(initial.id)
    const removePopstateListener = history.listen(handlePopstate)
    return () => {
      removePopstateListener()
      started = false
    }
  }

  if (options.lifecycle) {
    options.lifecycle.register(start)
  }
  else if (typeof window !== 'undefined') {
    onMount(start)
    $effect(() => {
      options.getCurrentFile()
      options.getFiles()
      canonicalizeCurrent()
    })
  }

  return {
    open(file) {
      if (!history)
        return
      const current = options.getCurrentFile()
      if (current?.id === file.id) {
        canonicalizeCurrent()
        select(file, { recordRecent: false, closeMobileSidebar: true })
        return
      }
      historyIndex += 1
      history.pushState(workspaceState(file, historyIndex), canonicalUrl(file))
      select(file, { recordRecent: true, closeMobileSidebar: true })
    },
    back() {
      if (!history)
        return
      if (historyIndex > 0) {
        history.back()
        return
      }
      history.navigate(options.dashboardUrl(options.getCurrentFile()))
    },
  }
}
