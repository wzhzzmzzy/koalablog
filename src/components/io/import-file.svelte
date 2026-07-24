<script lang="ts">
import type { DiskSourceFile } from "@/lib/files/disk";
import type { FileRecord } from '@/db/types'
import { flattenFileCollections } from "@/lib/files/collection";
import { supportFSApi } from "@/lib/services/file-reader";
import { importFromFilePicker } from "@/lib/services/io";
import { actions } from "astro:actions";
import { onMount } from "svelte";
import SveltePreview from '@/components/editor/svelte/SveltePreview.svelte'
import { SvelteBuildController } from '@/components/editor/svelte/build-controller.svelte'
import type { PreviewArtifact } from '@/components/editor/svelte/preview-protocol'
import type { SvelteBuildSuccess } from '@/lib/svelte/contracts'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
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
let buildFailures = $state<Map<string, string>>(new Map())
let previewReady = $state(false)
let preview: SveltePreview | undefined = $state()
const buildController = new SvelteBuildController()

// File data
let foundFiles = $state<DiskSourceFile[]>([])
let selectedFiles = $state<Set<number>>(new Set())
let duplicateFiles = $state<Set<number>>(new Set())

// Reference data
let allFilePaths = $state<string[]>([])

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
  selectedFiles = new Set()
  duplicateFiles = new Set()
  status = ImportStatus.IDLE
  saveError = null
  buildFailures = new Map()
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
    buildController.dispose()
    scrollUtils.unlock()
  }
})

async function waitForSavedBuild(file: FileRecord): Promise<SvelteBuildSuccess> {
  await buildController.saved({
    enabled: true,
    fileId: file.id,
    renderer: 'svelte',
    source: file.content,
    sourceHash: file.sourceHash,
  })
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const build = buildController.build
    if (build?.type === 'build-success')
      return build
    if (build?.type === 'build-error')
      throw new Error(build.error.message)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Svelte Artifact build timed out')
}

async function buildImportedArtifact(file: FileRecord) {
  if (!preview || !previewReady)
    throw new Error('Svelte Preview is still initializing')
  const build = await waitForSavedBuild(file)
  const artifact: PreviewArtifact = { css: build.css, javascript: build.javascript }
  const snapshotHtml = await preview.snapshot(artifact)
  if (!snapshotHtml)
    throw new Error('Svelte Preview did not produce an Artifact Snapshot')
  const result = await actions.db.renderArtifact.attach({
    fileId: file.id,
    schemaVersion: 1,
    renderer: 'svelte',
    svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
    unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
    unocssConfigHash: UNOCSS_CONFIG_HASH,
    sourceHash: file.sourceHash,
    dependencies: build.dependencies,
    javascript: build.javascript,
    css: build.css,
    snapshotHtml,
  })
  if (result.error)
    throw new Error(result.error.message)
}

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

    status = ImportStatus.BUILDING
    const failures = new Map<string, string>()
    for (const file of svelteFiles) {
      try {
        await buildImportedArtifact(file)
      }
      catch (error) {
        failures.set(file.path, error instanceof Error ? error.message : 'Svelte Artifact rebuild failed')
      }
    }
    buildFailures = failures
    status = ImportStatus.IDLE
    selectedFiles = new Set()
    if (failures.size === 0) {
      console.log(`Successfully imported and rebuilt ${savedFiles.length} posts`)
      resetState()
    }
  }
  else {
    status = ImportStatus.IDLE
  }
}
</script>

<section class="import-section" aria-label="File Import">
  <span>
    Import:
  </span>
  <button 
    id="import-from" 
    class="!w-30 btn"
    disabled={!supportFilePicker || status !== ImportStatus.IDLE}
    onclick={onImport}
    bind:this={triggerButton}
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
  </button>

{#if saveError && !showDrawer}
  <p class="error mb-0" role="alert">{saveError}</p>
{/if}

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
            class="close-button p-1 hover:bg-opacity-10 rounded btn"
            aria-label="Close import dialog"
          >
            ✕
          </button>
        </header>
      
        <!-- Controls -->
        <nav class="drawer-controls m-0 flex items-center gap-2 p-4" aria-label="Import actions">
          <button
            class="select-all-button !w-28 shrink-0 text-sm px-3 py-1 rounded btn"
            onclick={selectAll}
          >
            {selectedFiles.size === foundFiles.length - duplicateFiles.size ? 'Deselect All' : 'Select All'}
          </button>
          <button
            class="save-button !w-20 text-sm px-3 py-1 rounded btn"
            onclick={onSave}
            disabled={selectedFiles.size === 0 || status === ImportStatus.SAVING || status === ImportStatus.BUILDING || !previewReady}
          >
            {status === ImportStatus.SAVING ? 'Saving...' : status === ImportStatus.BUILDING ? 'Building Svelte...' : 'Save'}
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
                    {file.path}
                  </div>
                  <div class="file-info text-xs mt-1 space-y-1">
                    <div>{file.content.length} characters</div>
                    {#if isDuplicate}
                      <p class="error">This File already exists at the same Path</p>
                    {/if}
                    {#if buildFailures.has(file.path)}
                      <p class="error" data-import-build-failure={file.path}>Source saved, but Svelte Artifact rebuild failed: {buildFailures.get(file.path)}</p>
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

<div class="fixed left-0 top-0 h-16 w-16 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
  <SveltePreview bind:this={preview} onFocusReturn={() => {}} onReady={() => { previewReady = true }} />
</div>
