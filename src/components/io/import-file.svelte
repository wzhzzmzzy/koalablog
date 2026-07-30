<script lang="ts">
import type { DiskSourceFile } from "@/lib/files/disk";
import type { FileRecord } from '@/db/types'
import { flattenFileCollections } from "@/lib/files/collection";
import { supportFSApi } from "@/lib/services/file-reader";
import { importExchangeArchive, importFromFilePicker, pickExchangeArchive } from "@/lib/services/io";
import { actions } from "astro:actions";
import { onMount } from "svelte";
import { X } from '@lucide/svelte'
import { Button } from '@/components/ui/button'
import to from 'await-to-js'
import './import-file.scss';

// Component status constants
const ImportStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  SAVING: 'saving',
  BUILDING: 'building',
} as const

type ImportStatusType = typeof ImportStatus[keyof typeof ImportStatus]

// Core state
let status = $state<ImportStatusType>(ImportStatus.IDLE)
let supportFilePicker = $state(true)
let showDrawer = $state(false)
let saveError = $state<string | null>(null)
let rebuildRequired = $state<Set<string>>(new Set())

// File data
let foundFiles = $state<DiskSourceFile[]>([])
let selectedFiles = $state<Set<number>>(new Set())
let duplicateFiles = $state<Set<number>>(new Set())

// Reference data
let allFilePaths = $state<string[]>([])

// DOM references
let drawerElement = $state<HTMLElement | undefined>(undefined)
let triggerButton = $state<HTMLButtonElement | undefined>(undefined)

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
  selectedFiles = new Set()
  duplicateFiles = new Set()
  status = ImportStatus.IDLE
  saveError = null
  rebuildRequired = new Set()
  scrollUtils.unlock()
  triggerButton?.focus()
}

const checkForDuplicates = () => {
  const duplicates = new Set<number>()
  const newSelected = new Set<number>()
  
  foundFiles.forEach((file, index) => {
    const isDuplicate = allFilePaths.includes(file.path)
    
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

  actions.db.markdown.all({ includeTrash: false }).then((allFilesFromDB) => {
    if (allFilesFromDB.error) {
      console.error('Failed to load existing File Paths:', allFilesFromDB.error)
    } else {
      const data = allFilesFromDB.data
      allFilePaths = flattenFileCollections(data ?? {})
        .map(file => file.path)
    }
  })
  
  // Cleanup function to ensure scroll is unlocked if component unmounts
  return () => {
    scrollUtils.unlock()
  }
})

const onImport = async () => {
  status = ImportStatus.LOADING
  
  // Import files
  const [importError, result] = await to(importFromFilePicker())
  if (importError) {
    console.error('Import failed:', importError)
    saveError = importError instanceof Error ? importError.message : 'Import failed'
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

  checkForDuplicates()
  
  status = ImportStatus.IDLE
  
  // Focus management
  setTimeout(() => drawerElement?.focus(), 100)
}

const onImportArchive = async () => {
  saveError = null
  const archive = await pickExchangeArchive()
  if (!archive)
    return
  status = ImportStatus.LOADING
  try {
    const result = await importExchangeArchive(archive)
    rebuildRequired = new Set(result.rebuildRequired)
    if (result.created.length === 0 && result.skippedExisting.length > 0)
      saveError = `No Files imported; existing Paths were skipped: ${result.skippedExisting.join(', ')}`
  }
  catch (error) {
    saveError = error instanceof Error ? error.message : 'Archive import failed'
  }
  finally {
    status = ImportStatus.IDLE
  }
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
  
  const selectedFilesToImport = Array.from(selectedFiles).map(index => ({
    path: foundFiles[index].path,
    renderer: foundFiles[index].renderer,
    content: foundFiles[index].content,
  }))
  
  // Save to database
  const result = await actions.db.markdown.batchImport(selectedFilesToImport)
  
  if (result.error) {
    saveError = result.error.message
    status = ImportStatus.IDLE
    return
  }
  
  if (result.data) {
    const savedFiles = result.data as FileRecord[]
    const svelteFiles = savedFiles.filter(file => file.renderer === 'svelte')
    if (svelteFiles.length === 0) {
      console.log(`Successfully imported ${savedFiles.length} posts`)
      resetState()
      return
    }

    status = ImportStatus.IDLE
    selectedFiles = new Set()
    rebuildRequired = new Set(svelteFiles.map(file => file.path))
  }
  else {
    status = ImportStatus.IDLE
  }
}
</script>

<section class="import-section" aria-label="File Import">
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border py-4">
    <div>
      <p class="text-sm font-medium text-foreground">Import files</p>
      <p class="mt-1 text-sm text-muted-foreground">Choose a local folder to add Markdown and Svelte Files.</p>
    </div>
    <Button
    id="import-from" 
    variant="outline"
    disabled={!supportFilePicker || status !== ImportStatus.IDLE}
    onclick={onImport}
    bind:ref={triggerButton}
  >
    {#if status === ImportStatus.LOADING}
      Loading...
    {:else if status === ImportStatus.SAVING}
      Saving...
    {:else if status === ImportStatus.BUILDING}
      Building Svelte...
    {:else}
      Choose File
    {/if}
    </Button>
    <Button
      id="import-archive"
      variant="outline"
      disabled={status !== ImportStatus.IDLE}
      onclick={onImportArchive}
    >
      Import ZIP
    </Button>
  </div>

{#if saveError && !showDrawer}
  <p class="error mb-0" role="alert">{saveError}</p>
{/if}
{#if rebuildRequired.size > 0 && !showDrawer}
  <p class="error mb-0" role="status" data-import-rebuild-required>
    Source imported; open Dashboard and Deploy: {Array.from(rebuildRequired).join(', ')}
  </p>
{/if}

<!-- Slide-out drawer -->
{#if showDrawer}
  <div
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
          <Button
            type="button"
            onclick={closeDrawer}
            variant="ghost"
            size="icon-sm"
            aria-label="Close import dialog"
          >
            <X />
          </Button>
        </header>
      
        <!-- Controls -->
        <nav class="drawer-controls m-0 flex items-center gap-2 p-4" aria-label="Import actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="select-all-button shrink-0"
            onclick={selectAll}
          >
            {selectedFiles.size === foundFiles.length - duplicateFiles.size ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            type="button"
            size="sm"
            class="save-button"
            onclick={onSave}
            disabled={selectedFiles.size === 0 || status === ImportStatus.SAVING}
          >
            {status === ImportStatus.SAVING ? 'Saving...' : status === ImportStatus.BUILDING ? 'Building Svelte...' : 'Save'}
          </Button>
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
                    {file.path}
                  </div>
                  <div class="file-info text-xs mt-1 space-y-1">
                    <div>{file.content.length} characters</div>
                    {#if isDuplicate}
                      <p class="error">This File already exists at the same Path</p>
                    {/if}
                    {#if rebuildRequired.has(file.path)}
                      <p class="error" data-import-rebuild-required={file.path}>Source saved; open this File in Dashboard and select Deploy to create its Svelte Artifact.</p>
                    {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </main>
      </div>
    </div>
  </div>
{/if}

</section>
