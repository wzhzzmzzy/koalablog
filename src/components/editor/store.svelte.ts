import type { Markdown } from '@/db/types'
import { actions } from 'astro:actions'

export const editorStore = $state<{
  items: Markdown[]
  loading: boolean
  hasAttemptedLoad: boolean
}>({
  items: [],
  loading: false,
  hasAttemptedLoad: false,
})

export function setItems(newItems: Markdown[]) {
  editorStore.items = newItems
  editorStore.hasAttemptedLoad = true
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

export async function loadAll() {
  if (editorStore.loading || editorStore.hasAttemptedLoad)
    return
  editorStore.loading = true

  try {
    const result = await actions.db.markdown.all({ source: 'all' })

    if (result.data) {
      const newItems = [...(result.data.posts || []), ...(result.data.pages || []), ...(result.data.memos || [])]
      editorStore.items = newItems
    }
    else if (result.error) {
      console.error('Store loadAll error', result.error)
    }
  }
  finally {
    editorStore.loading = false
    editorStore.hasAttemptedLoad = true
  }
}
