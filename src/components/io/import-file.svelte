<script lang="ts">
import { supportFSApi } from "@/lib/services/file-reader";
import { importFromFilePicker } from "@/lib/services/io";
import { onMount } from "svelte";

let supportFilePicker = $state(true)
let foundFiles = $state<Array<{ subject: string, content: string }>>([])
let selectedFiles = $state<Set<number>>(new Set())
let loading = $state(false)
let hasTriggeredImport = $state(false)

onMount(() => {
  supportFilePicker = supportFSApi()
})

const onImport = async () => {
  loading = true
  hasTriggeredImport = true
  try {
    const result = await importFromFilePicker()
    if (Array.isArray(result)) {
      foundFiles = result
      selectedFiles = new Set() // 重置选择
    }
  } catch (error) {
    console.error('Import failed:', error)
  } finally {
    loading = false
  }
}

const toggleFileSelection = (index: number) => {
  const newSelected = new Set(selectedFiles)
  if (newSelected.has(index)) {
    newSelected.delete(index)
  } else {
    newSelected.add(index)
  }
  selectedFiles = newSelected
}

const selectAll = () => {
  if (selectedFiles.size === foundFiles.length) {
    selectedFiles = new Set()
  } else {
    selectedFiles = new Set(foundFiles.map((_, index) => index))
  }
}

const handleKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleFileSelection(index)
  }
}
</script>

<div>
  <span>
    Import:
  </span>
  <button 
    id="import-from" 
    class="!w-30"
    disabled={!supportFilePicker || loading}
    onclick={onImport}
  >
    {loading ? 'Loading...' : 'Import file'}
  </button>

  {#if foundFiles.length > 0}
    <div class="mt-4">
      <div class="flex items-center gap-2 mb-2">
        <button
          class="!w-30"
          onclick={selectAll}
        >
          {selectedFiles.size === foundFiles.length ? 'Deselect All' : 'Select All'}
        </button>
        <span class="text-sm" style="color: var(--koala-blockquote-text)">
          {selectedFiles.size} of {foundFiles.length} files selected
        </span>
      </div>

      <ul class="max-h-60 overflow-y-auto" role="listbox" aria-label="Files to import">
        {#each foundFiles as file, index}
          <li
            class="flex items-center gap-2 p-2 cursor-pointer select-none focus:outline-none"
            role="option"
            aria-selected={selectedFiles.has(index)}
            tabindex="0"
            onclick={() => toggleFileSelection(index)}
            onkeydown={(e) => handleKeydown(e, index)}
          >
            <input
              type="checkbox"
              checked={selectedFiles.has(index)}
              onchange={() => toggleFileSelection(index)}
              onclick={(e) => e.stopPropagation()}
              tabindex="-1"
              aria-hidden="true"
            />
            <span class="flex-1 text-sm font-mono">{file.subject}</span>
            <span class="text-xs" style="color: var(--koala-blockquote-text)">
              {file.content.length} chars
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {:else if foundFiles.length === 0 && !loading && hasTriggeredImport}
    <div class="mt-4 text-sm" style="color: var(--koala-blockquote-text)">
      No files found
    </div>
  {/if}
</div>
