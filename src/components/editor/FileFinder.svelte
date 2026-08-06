<script lang="ts">
  import type { FileRecord } from '@/db/types'
  import { Search, X } from '@lucide/svelte'
  import { tick } from 'svelte'
  import { editBuffers } from './edit-buffer.svelte'
  import { emptyFileFinderGroups } from './file-finder-model'
  import { highlightSearchText, searchFiles } from './instant-search'

  interface Props {
    open: boolean
    files: readonly FileRecord[]
    recentFiles: readonly FileRecord[]
    onOpen: (file: FileRecord) => void
    onClose: () => void
  }

  let { open, files, recentFiles, onOpen, onClose }: Props = $props()
  let dialog: HTMLDialogElement | undefined = $state()
  let input: HTMLInputElement | undefined = $state()
  let returnFocus: HTMLElement | null = null
  let query = $state('')
  let activeQuery = $state('')
  let activeIndex = $state(0)
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let visibleKey = ''

  const emptyGroups = $derived(emptyFileFinderGroups(files, editBuffers, recentFiles))
  const searchResponse = $derived(searchFiles(files, activeQuery, editBuffers))
  const queryResults = $derived(searchResponse.results)
  const waitingForSearch = $derived(Boolean(query.trim()) && query.trim() !== activeQuery.trim())
  const visibleFiles = $derived(waitingForSearch
    ? []
    : query.trim()
    ? queryResults.map(result => result.file)
    : [...emptyGroups.localChanges, ...emptyGroups.recent])
  const activeFile = $derived(visibleFiles[activeIndex] ?? null)
  const activeOptionId = $derived(activeFile ? `file-finder-option-${activeFile.id}` : undefined)

  function restoreFocus() {
    if (returnFocus && document.contains(returnFocus))
      returnFocus.focus()
    returnFocus = null
  }

  function requestClose(shouldRestoreFocus = true) {
    if (dialog?.open)
      dialog.close()
    onClose()
    if (shouldRestoreFocus)
      void tick().then(restoreFocus)
  }

  function choose(file: FileRecord) {
    onOpen(file)
    requestClose(false)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!visibleFiles.length)
        return
      event.preventDefault()
      activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + visibleFiles.length) % visibleFiles.length
      void tick().then(() => document.getElementById(`file-finder-option-${visibleFiles[activeIndex]?.id}`)?.scrollIntoView({ block: 'nearest' }))
      return
    }
    if (event.key === 'Enter' && activeFile) {
      event.preventDefault()
      choose(activeFile)
    }
  }

  $effect(() => {
    const nextQuery = query
    if (searchTimer)
      clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      activeQuery = nextQuery
    }, 80)
    return () => {
      if (searchTimer)
        clearTimeout(searchTimer)
    }
  })

  $effect(() => {
    const nextKey = visibleFiles.map(file => file.id).join(',')
    if (nextKey !== visibleKey) {
      visibleKey = nextKey
      activeIndex = 0
    }
  })

  $effect(() => {
    if (!dialog)
      return
    if (open && !dialog.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (searchTimer)
        clearTimeout(searchTimer)
      query = ''
      activeQuery = ''
      activeIndex = 0
      dialog.showModal()
      void tick().then(() => input?.focus())
    }
    else if (!open && dialog.open) {
      dialog.close()
    }
  })
</script>

<dialog
  bind:this={dialog}
  class="editor-file-finder"
  aria-labelledby="file-finder-title"
  aria-describedby="file-finder-description"
  oncancel={(event) => { event.preventDefault(); requestClose() }}
  onclick={(event) => { if (event.target === dialog) requestClose() }}
>
  <header class="editor-file-finder__header">
    <div>
      <h2 id="file-finder-title">Find a File</h2>
      <p id="file-finder-description">Search active Files by Path, Tag, or Source.</p>
    </div>
    <button type="button" class="editor-tool-button" aria-label="Close File Finder" onclick={() => requestClose()}><X size={18} /></button>
  </header>
  <div class="editor-file-finder__input">
    <Search size={18} aria-hidden="true" />
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      role="combobox"
      aria-label="Find a File"
      aria-autocomplete="list"
      aria-controls="file-finder-results"
      aria-expanded={open}
      aria-activedescendant={activeOptionId}
      autocomplete="off"
      spellcheck="false"
      placeholder="Search Files"
      onkeydown={handleKeydown}
    />
  </div>
  <div id="file-finder-results" class="editor-file-finder__results" role="listbox" aria-label="File results">
    {#if query.trim()}
      {#if queryResults.length}
        {#each queryResults as result, index (result.file.id)}
          <button
            id={`file-finder-option-${result.file.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            class="editor-file-finder__result"
            onclick={() => choose(result.file)}
          >
            <span class="editor-file-finder__result-title">
              {#each highlightSearchText(result.title, activeQuery) as segment}
                {#if segment.matched}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
              {/each}
              {#if result.dirty}<span class="editor-file-tree__dirty" aria-label="Unsaved changes"></span>{/if}
            </span>
            <span class="editor-file-finder__result-path">{result.path}</span>
            <span class="editor-file-finder__result-kind">{result.primaryMatch}</span>
          </button>
        {/each}
      {:else}
        <p class="editor-file-finder__empty">No matching active Files</p>
      {/if}
    {:else if emptyGroups.localChanges.length || emptyGroups.recent.length}
      {#if emptyGroups.localChanges.length}
        <section class="editor-file-finder__group" aria-labelledby="file-finder-local-changes">
          <h3 id="file-finder-local-changes">Local changes</h3>
          {#each emptyGroups.localChanges as file, index (file.id)}
            <button id={`file-finder-option-${file.id}`} type="button" role="option" aria-selected={index === activeIndex} class="editor-file-finder__result" onclick={() => choose(file)}>
              <span class="editor-file-finder__result-title">{file.title}<span class="editor-file-tree__dirty" aria-label="Unsaved changes"></span></span>
              <span class="editor-file-finder__result-path">{file.path}</span>
            </button>
          {/each}
        </section>
      {/if}
      {#if emptyGroups.recent.length}
        <section class="editor-file-finder__group" aria-labelledby="file-finder-recent">
          <h3 id="file-finder-recent">Recent</h3>
          {#each emptyGroups.recent as file, index (file.id)}
            {@const resultIndex = emptyGroups.localChanges.length + index}
            <button id={`file-finder-option-${file.id}`} type="button" role="option" aria-selected={resultIndex === activeIndex} class="editor-file-finder__result" onclick={() => choose(file)}>
              <span class="editor-file-finder__result-title">{file.title}</span>
              <span class="editor-file-finder__result-path">{file.path}</span>
            </button>
          {/each}
        </section>
      {/if}
    {:else}
      <p class="editor-file-finder__empty">Start typing to find a File</p>
    {/if}
  </div>
</dialog>
