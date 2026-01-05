import type { Markdown } from '@/db/types'

export const editorStore = $state<{
  items: Markdown[]
  currentMarkdown: Markdown | null
  loading: boolean
  hasAttemptedLoad: boolean
  history: string[]
}>({
  items: [],
  currentMarkdown: null,
  loading: false,
  hasAttemptedLoad: false,
  history: [],
})

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
