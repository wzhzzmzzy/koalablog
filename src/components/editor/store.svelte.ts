import type { Markdown } from '@/db/types'

export const editorStore = $state<{
  items: Markdown[]
  currentMarkdown: Markdown | null
  loading: boolean
  hasAttemptedLoad: boolean
}>({
  items: [],
  currentMarkdown: null,
  loading: false,
  hasAttemptedLoad: false,
})

export function setItems(newItems: Markdown[]) {
  editorStore.items = newItems
  editorStore.hasAttemptedLoad = true
}

export function setCurrentMarkdown(markdown: Markdown | null) {
  editorStore.currentMarkdown = markdown
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
