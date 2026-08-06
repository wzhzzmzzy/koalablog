import type { FileRecord } from '@/db/types'
import { describe, expect, it } from 'vitest'
import {
  createWorkspaceNavigation,
  type WorkspaceHistoryState,
} from '@/components/editor/workspace-navigation.svelte'
import { makeFileRecord } from '@/tests/fixtures/file-record'

type PopStateListener = (state: unknown) => void

class FakeHistory {
  state: unknown = null
  url = new URL('https://koala.test/dashboard/edit?path=/first')
  readonly pushes: Array<{ state: WorkspaceHistoryState, url: string }> = []
  readonly replacements: Array<{ state: WorkspaceHistoryState, url: string }> = []
  backCalls = 0
  readonly navigations: string[] = []
  private listener: PopStateListener | null = null

  currentState() {
    return this.state
  }

  currentUrl() {
    return new URL(this.url)
  }

  pushState(state: WorkspaceHistoryState, url: URL) {
    this.state = state
    this.url = new URL(url)
    this.pushes.push({ state, url: `${url.pathname}${url.search}` })
  }

  replaceState(state: WorkspaceHistoryState, url: URL) {
    this.state = state
    this.url = new URL(url)
    this.replacements.push({ state, url: `${url.pathname}${url.search}` })
  }

  back() {
    this.backCalls += 1
  }

  navigate(url: string) {
    this.navigations.push(url)
  }

  listen(listener: PopStateListener) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  pop(state: unknown) {
    this.state = state
    this.listener?.(state)
  }
}

function setup(initial: FileRecord | null, files: FileRecord[] = initial ? [initial] : []) {
  const history = new FakeHistory()
  let current = initial
  let stopped = false
  const selections: number[] = []
  const recent: number[] = []
  const sidebars: boolean[] = []
  let start: (() => void | (() => void)) | undefined

  const navigation = createWorkspaceNavigation({
    initialFile: initial,
    getFiles: () => files,
    getCurrentFile: () => current,
    select: (file) => {
      current = file
      if (file)
        selections.push(file.id)
    },
    isMobile: () => true,
    closeSidebar: () => sidebars.push(false),
    recordRecent: id => recent.push(id),
    dashboardUrl: file => file ? '/dashboard/memo' : '/dashboard',
    history,
    lifecycle: {
      register(callback) {
        start = callback
      },
    },
  })

  const teardown = start?.()
  return {
    current: () => current,
    history,
    navigation,
    recent,
    selections,
    sidebars,
    stop() {
      if (typeof teardown === 'function')
        teardown()
      stopped = true
    },
    isStopped: () => stopped,
  }
}

describe('editor Workspace Navigation', () => {
  it('initializes a direct File URL as history index zero', () => {
    const first = makeFileRecord({ id: 11, path: '/first' })
    const { history } = setup(first)

    expect(history.replacements).toEqual([{
      state: { koalaWorkspaceHistory: 1, fileId: 11, index: 0 },
      url: '/dashboard/edit?path=%2Ffirst',
    }])
  })

  it('pushes a different File once, coordinates selection, mobile Sidebar, and MRU', () => {
    const first = makeFileRecord({ id: 11, path: '/first' })
    const second = makeFileRecord({ id: 12, path: '/second' })
    const result = setup(first, [first, second])

    result.navigation.open(second)
    result.navigation.open(second)

    expect(result.history.pushes).toEqual([{
      state: { koalaWorkspaceHistory: 1, fileId: 12, index: 1 },
      url: '/dashboard/edit?path=%2Fsecond',
    }])
    expect(result.current()?.id).toBe(12)
    expect(result.selections).toEqual([12, 12])
    expect(result.sidebars).toEqual([false, false])
    expect(result.recent).toEqual([11, 12])
  })

  it('coordinates mobile Sidebar and focus when reopening the current File without pushing history', () => {
    const first = makeFileRecord({ id: 11, path: '/first' })
    const result = setup(first)

    result.navigation.open(first)

    expect(result.history.pushes).toEqual([])
    expect(result.selections).toEqual([11])
    expect(result.sidebars).toEqual([false])
    expect(result.recent).toEqual([11])
  })

  it('replays browser history by File ID and canonicalizes a stale Path', () => {
    const first = makeFileRecord({ id: 11, path: '/first' })
    const renamed = makeFileRecord({ id: 12, path: '/renamed' })
    const result = setup(first, [first, renamed])

    result.history.pop({ koalaWorkspaceHistory: 1, fileId: 12, index: 4 })

    expect(result.current()?.id).toBe(12)
    expect(result.history.replacements.at(-1)).toEqual({
      state: { koalaWorkspaceHistory: 1, fileId: 12, index: 4 },
      url: '/dashboard/edit?path=%2Frenamed',
    })
    expect(result.recent).toEqual([11, 12])
    expect(result.sidebars).toEqual([false])
  })

  it('uses browser back above index zero and the collection dashboard at zero', () => {
    const first = makeFileRecord({ id: 11, path: '/first' })
    const second = makeFileRecord({ id: 12, path: '/second' })
    const result = setup(first, [first, second])

    result.navigation.open(second)
    result.navigation.back()
    expect(result.history.backCalls).toBe(1)

    result.history.pop({ koalaWorkspaceHistory: 1, fileId: 11, index: 0 })
    result.navigation.back()
    expect(result.history.navigations).toEqual(['/dashboard/memo'])
  })

  it('keeps a valid current File for an unresolvable historical entry and replaces that entry', () => {
    const current = makeFileRecord({ id: 11, path: '/current' })
    const result = setup(current, [current])

    result.history.pop({ koalaWorkspaceHistory: 1, fileId: 999, index: 3 })

    expect(result.current()?.id).toBe(11)
    expect(result.history.replacements.at(-1)).toEqual({
      state: { koalaWorkspaceHistory: 1, fileId: 11, index: 3 },
      url: '/dashboard/edit?path=%2Fcurrent',
    })
  })

  it('uses a recycled File ID URL and removes its popstate listener with the workspace lifecycle', () => {
    const recycled = makeFileRecord({ id: 11, path: '/deleted', deletedAt: new Date('2026-08-05T00:00:00Z') })
    const result = setup(recycled, [recycled])

    expect(result.history.replacements.at(-1)).toEqual({
      state: { koalaWorkspaceHistory: 1, fileId: 11, index: 0 },
      url: '/dashboard/edit?id=11',
    })
    result.stop()
    result.history.pop({ koalaWorkspaceHistory: 1, fileId: null, index: 1 })

    expect(result.isStopped()).toBe(true)
    expect(result.current()?.id).toBe(11)
  })
})
