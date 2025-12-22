<script lang="ts">
import { supportFSApi } from "@/lib/services/file-reader";
import { importFromFilePicker } from "@/lib/services/io";
import { batchParseMarkdown, stripMetaBlock, type ParsedMarkdownResult } from "@/lib/services/markdown-parser";
import { actions } from "astro:actions";
import { onMount } from "svelte";
import to from 'await-to-js'
import './import-file.scss';

// Component status constants
const ImportStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  PARSING: 'parsing', 
  SAVING: 'saving'
} as const

type ImportStatusType = typeof ImportStatus[keyof typeof ImportStatus]

// Core state
let status = $state<ImportStatusType>(ImportStatus.IDLE)
let supportFilePicker = $state(true)
let showDrawer = $state(false)
let saveError = $state<string | null>(null)

// File data
let foundFiles = $state<Array<{ subject: string, content: string }>>([])
let parsedFiles = $state<Array<ParsedMarkdownResult & { subject: string, originalContent: string }>>([])
let selectedFiles = $state<Set<number>>(new Set())
let duplicateFiles = $state<Set<number>>(new Set())

// Reference data
let allPosts = $state<Array<{ subject: string, link: string }>>([])

// DOM references
// svelte-ignore non_reactive_update
let drawerElement: HTMLElement | undefined
let triggerButton: HTMLButtonElement | undefined

// Utility functions
const scrollUtils = {
  lock: () => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${scrollbarWidth}px`
  },
  unlock: () => {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}

const resetState = () => {
  showDrawer = false
  foundFiles = []
  parsedFiles = []
  selectedFiles = new Set()
  duplicateFiles = new Set()
  status = ImportStatus.IDLE
  saveError = null
  scrollUtils.unlock()
  triggerButton?.focus()
}

const createFallbackParsedFiles = (files: Array<{ subject: string, content: string }>) => {
  return files.map(file => ({
    subject: file.subject,
    originalContent: file.content,
    html: '',
    meta: undefined,
    outgoingLinks: [],
    tags: [],
    error: 'Failed to parse markdown'
  }))
}

const checkForDuplicates = () => {
  const duplicates = new Set<number>()
  const newSelected = new Set<number>()
  
  foundFiles.forEach((file, index) => {
    const parsedFile = parsedFiles[index]
    const link = parsedFile?.meta?.link as string | undefined
    
    // Check for duplicates by subject or link
    const isDuplicate = allPosts.some(post => 
      post.subject === file.subject || 
      (link && post.link === link)
    )
    
    if (isDuplicate) {
      duplicates.add(index)
    } else {
      // Only auto-select non-duplicate files
      newSelected.add(index)
    }
  })
  
  duplicateFiles = duplicates
  selectedFiles = newSelected
}

onMount(() => {
  supportFilePicker = supportFSApi()

  // Load posts for link resolution
  actions.db.markdown.all({ source: 'post' }).then((allPostsFromDB) => {
    if (allPostsFromDB.error) {
      console.error('Failed to load posts for link resolution:', allPostsFromDB.error)
    } else {
      allPosts = allPostsFromDB.data?.posts?.map(p => ({ 
        subject: p.subject, 
        link: p.link 
      })) || []
    }
  })
  
  // Cleanup function to ensure scroll is unlocked if component unmounts
  return () => scrollUtils.unlock()
})

const onImport = async () => {
  status = ImportStatus.LOADING
  
  // Import files
  const [importError, result] = await to(importFromFilePicker())
  if (importError) {
    console.error('Import failed:', importError)
    status = ImportStatus.IDLE
    return
  }
  
  if (!Array.isArray(result)) {
    status = ImportStatus.IDLE
    return
  }

  // Setup drawer
  foundFiles = result
  selectedFiles = new Set()
  showDrawer = true
  scrollUtils.lock()
  
  // Parse markdown files
  status = ImportStatus.PARSING
  const [parseError, parsed] = await to(batchParseMarkdown(result, {
    includeMeta: true,
    allPostLinks: allPosts
  }))
  
  parsedFiles = parseError ? createFallbackParsedFiles(result) : parsed
  if (parseError) {
    console.error('Failed to parse markdown files:', parseError)
  }
  
  // Check for duplicates and update selection
  checkForDuplicates()
  
  status = ImportStatus.IDLE
  
  // Focus management
  setTimeout(() => drawerElement?.focus(), 100)
}

const toggleFileSelection = (index: number) => {
  // Prevent selecting duplicate files
  if (duplicateFiles.has(index)) return
  
  const newSelected = new Set(selectedFiles)
  if (newSelected.has(index)) {
    newSelected.delete(index)
  } else {
    newSelected.add(index)
  }
  selectedFiles = newSelected
}

const selectAll = () => {
  // Get non-duplicate file indices
  const nonDuplicateIndices = foundFiles
    .map((_, index) => index)
    .filter(index => !duplicateFiles.has(index))
  
  if (selectedFiles.size === nonDuplicateIndices.length) {
    selectedFiles = new Set()
  } else {
    selectedFiles = new Set(nonDuplicateIndices)
  }
}

const handleFileKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleFileSelection(index)
  }
}

const closeDrawer = () => {
  resetState()
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && showDrawer) {
    closeDrawer()
  }
}

const handleDrawerWheel = (event: WheelEvent) => {
  // Allow scrolling within the drawer, prevent body scroll
  const target = event.target as HTMLElement
  const drawer = event.currentTarget as HTMLElement
  
  // If we're scrolling within the drawer content, allow it
  if (drawer.contains(target)) {
    event.stopPropagation()
  }
}

const onSave = async () => {
  if (selectedFiles.size === 0) return
  
  status = ImportStatus.SAVING
  saveError = null
  
  // Prepare selected posts data
  const selectedPosts = Array.from(selectedFiles).map(index => {
    const originalFile = foundFiles[index]
    const parsedFile = parsedFiles[index]
    
    // Use parsed data if available, fallback to original
    const tagsArray = parsedFile?.tags || []
    const tags = tagsArray.length > 0 ? tagsArray.join(',') : 
                 (parsedFile?.meta?.tags as string | undefined) || undefined
    
    // Extract meta fields
    const meta = parsedFile?.meta
    const createdAt = meta?.createdAt as string | undefined
    const updatedAt = meta?.updatedAt as string | undefined
    const link = meta?.link as string | undefined
    const metaSubject = meta?.subject as string | undefined
    const source = meta?.source as number | undefined
    const isPrivate = meta?.private as boolean | undefined
    
    return {
      subject: metaSubject || originalFile.subject,
      content: stripMetaBlock(originalFile.content),
      tags,
      link,
      source,
      private: isPrivate,
      createdAt,
      updatedAt,
      outgoingLinks: parsedFile?.outgoingLinks || []
    }
  })
  
  // Save to database
  const result = await actions.db.markdown.batchImport(selectedPosts)
  
  if (result.error) {
    saveError = result.error.message
    status = ImportStatus.IDLE
    return
  }
  
  if (result.data) {
    console.log(`Successfully imported ${result.data.length} posts`)
    resetState()
  }
}
</script>

<section class="import-section" aria-label="File Import">
  <span>
    Import:
  </span>
  <button 
    id="import-from" 
    class="!w-30"
    disabled={!supportFilePicker || status !== ImportStatus.IDLE}
    onclick={onImport}
    bind:this={triggerButton}
  >
    {#if status === ImportStatus.LOADING}
      Loading...
    {:else if status === ImportStatus.PARSING}
      Parsing...
    {:else if status === ImportStatus.SAVING}
      Saving...
    {:else}
      Choose File
    {/if}
  </button>

<!-- Slide-out drawer -->
{#if showDrawer}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside 
    class="import-drawer" 
    role="dialog" 
    aria-labelledby="import-dialog-title"
    aria-modal="true"
    onkeydown={handleGlobalKeydown}
    onwheel={handleDrawerWheel}
    bind:this={drawerElement}
    tabindex="-1"
  >
    <!-- Overlay -->
    <div 
      class="drawer-overlay fixed inset-0 z-40"
      aria-hidden="true"
      onclick={closeDrawer}
    ></div>
    
    <!-- Drawer -->
    <div class="drawer-content fixed top-0 right-0 h-full w-96 z-50 transform transition-transform duration-300 ease-in-out">
      <div class="flex flex-col h-full">
        <!-- Header -->
        <header class="drawer-header flex items-center justify-between p-4">
          <h3 id="import-dialog-title" class="text-lg font-semibold">Import Files</h3>
          <button 
            onclick={closeDrawer}
            class="close-button p-1 hover:bg-opacity-10 rounded"
            aria-label="Close import dialog"
          >
            ✕
          </button>
        </header>
      
        <!-- Controls -->
        <nav class="drawer-controls m-0 flex items-center gap-2 p-4" aria-label="Import actions">
          <button
            class="select-all-button !w-28 shrink-0 text-sm px-3 py-1 rounded"
            onclick={selectAll}
          >
            {selectedFiles.size === foundFiles.length - duplicateFiles.size ? 'Deselect All' : 'Select All'}
          </button>
          <button
            class="save-button !w-20 text-sm px-3 py-1 rounded"
            onclick={onSave}
            disabled={selectedFiles.size === 0 || status === ImportStatus.SAVING}
          >
            {status === ImportStatus.SAVING ? 'Saving...' : 'Save'}
          </button>
          <span class="selection-count text-sm ml-auto">
            {selectedFiles.size} of {foundFiles.length - duplicateFiles.size} selected
            {#if duplicateFiles.size > 0}
              <span>({duplicateFiles.size} duplicates skipped)</span>
            {/if}
          </span>
        </nav>

        <!-- Error display -->
        {#if saveError}
          <div class="p-4 border-t border-red-200">
            <p class="error mb-0">{saveError}</p>
          </div>
        {/if}
      
        <!-- File list -->
        <main class="file-list flex-1 overflow-y-auto">
          <ul role="listbox" aria-label="Files to import" class="m-0">
            {#each foundFiles as file, index}
              {@const isDuplicate = duplicateFiles.has(index)}
              <li
                class="file-item flex items-center gap-3 p-3 transition-colors duration-150 {isDuplicate ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer select-none focus:outline-none'}"
                role="option"
                aria-selected={selectedFiles.has(index)}
                tabindex={isDuplicate ? -1 : 0}
                onclick={() => toggleFileSelection(index)}
                onkeydown={(e) => handleFileKeydown(e, index)}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(index)}
                  disabled={isDuplicate}
                  onchange={() => toggleFileSelection(index)}
                  onclick={(e) => e.stopPropagation()}
                  tabindex="-1"
                  aria-hidden="true"
                />
                <div class="flex-1 min-w-0">
                  <div class="file-name text-sm font-mono truncate">
                    {file.subject}
                  </div>
                  <div class="file-info text-xs mt-1 space-y-1">
                    <div>{file.content.length} characters</div>
                    {#if isDuplicate}
                      <p class="error">This file already exists (same subject or link)</p>
                    {:else if parsedFiles[index]?.error}
                      <p class="error">{parsedFiles[index].error}</p>
                    {:else if parsedFiles[index]}
                      {@const parsed = parsedFiles[index]}
                      {#if parsed.tags?.length > 0}
                        <div>🏷️ Tags: {parsed.tags.join(', ')}</div>
                      {/if}
                      {#if parsed.outgoingLinks?.length > 0}
                        <div>🔗 Links: {parsed.outgoingLinks.length}</div>
                      {/if}
                      {#if parsed.meta && Object.keys(parsed.meta).length > 0}
                        <div>📋 Meta: {Object.keys(parsed.meta).length} fields</div>
                      {/if}
                    {:else if status === ImportStatus.PARSING}
                      <div class="text-blue-500">⏳ Parsing...</div>
                    {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </main>
      </div>
    </div>
  </aside>
{/if}

</section>

