import type { Markdown } from '@/db/types'
import { SvelteMap } from 'svelte/reactivity'

export const SIDEBAR_STORAGE_KEY = 'koala-editor-sidebar'
export const DRAFTS_STORAGE_KEY = 'koala-editor-drafts'

function getStoredSidebar() {
  if (typeof localStorage === 'undefined')
    return true
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

function getStoredDrafts(): [string, Markdown][] {
  if (typeof localStorage === 'undefined')
    return []
  const stored = localStorage.getItem(DRAFTS_STORAGE_KEY)
  if (!stored)
    return []
  try {
    return JSON.parse(stored)
  }
  catch {
    return []
  }
}

export const editorStore = $state<{
  items: Markdown[]
  currentMarkdown: Markdown | null
  loading: boolean
  hasAttemptedLoad: boolean
  history: string[]
  showSidebar: boolean
}>({
  items: [],
  currentMarkdown: null,
  loading: false,
  hasAttemptedLoad: false,
  history: [],
  showSidebar: getStoredSidebar(),
})

export const notifyStore = $state<{
  text: string
  type: 'info' | 'success' | 'error' | 'warning'
}>({
  text: '',
  type: 'info',
})

let notifyTimer: NodeJS.Timeout

export function notify(type: 'info' | 'success' | 'error' | 'warning', text: string, timeout = 2000) {
  notifyStore.type = type
  notifyStore.text = text

  if (notifyTimer)
    clearTimeout(notifyTimer)

  if (timeout > 0) {
    notifyTimer = setTimeout(() => {
      notifyStore.text = ''
    }, timeout)
  }
}

export const drafts = new SvelteMap<string, Markdown>(getStoredDrafts())

// Hook to enable auto-persistence
export function useEditorPersistence() {
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(Array.from(drafts.entries())))
    }
  })

  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(editorStore.showSidebar))
    }
  })
}

export function setDraft(link: string, markdown: Markdown) {
  drafts.set(link, markdown)
}

export function removeDraft(link: string) {
  drafts.delete(link)
}

export function setShowSidebar(show: boolean) {
  editorStore.showSidebar = show
}

export function toggleSidebar() {
  editorStore.showSidebar = !editorStore.showSidebar
}

export function setItems(newItems: Markdown[]) {
  editorStore.items = newItems
  editorStore.hasAttemptedLoad = true
}

export function setCurrentMarkdown(markdown: Markdown | null) {
  editorStore.currentMarkdown = markdown
}

export function pushHistory(link: string) {
  const last = editorStore.history[editorStore.history.length - 1]
  if (last !== link) {
    editorStore.history.push(link)
  }
}

export function popHistory() {
  return editorStore.history.pop()
}

export function updateLastHistory(link: string) {
  if (editorStore.history.length > 0) {
    editorStore.history[editorStore.history.length - 1] = link
  }
}

export function upsertItem(item: Markdown) {
  const index = editorStore.items.findIndex(i => i.id === item.id)
  if (index >= 0) {
    editorStore.items[index] = item
  }
  else {
    editorStore.items = [item, ...editorStore.items]
  }
}
