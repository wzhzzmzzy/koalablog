<script lang="ts">
  import type { FileRecord } from '@/db/types'
  import type { RendererMode } from '@/lib/files/types'
  import type { DeploymentSummary } from '@/lib/svelte/deployment-status'
  import { ArrowLeft, Eye, FileText, Menu, RotateCw, Save, SquarePen } from '@lucide/svelte'
  import type { EditBufferServerValues } from './edit-buffer.svelte'
  import { deployActionLabel } from './deployment-view-model'
  import EditorMoreMenu from './EditorMoreMenu.svelte'
  import type { MarkdownViewMode } from './markdown-view-state.svelte'
  import SvelteIcon from './SvelteIcon.svelte'
  import { toggleSidebar } from './store.svelte'

  type ClickHandler = (event: MouseEvent) => void | Promise<void>
  const noopClick: ClickHandler = () => {}

  interface Props {
    file: FileRecord | null
    pathValue?: string
    rendererValue?: RendererMode
    privateValue?: boolean
    changed?: boolean
    saving?: boolean
    savedAcknowledgement?: boolean
    conflict?: EditBufferServerValues | null
    showPreview?: boolean
    copyBtnText?: string
    trashed?: boolean
    deploying?: boolean
    deploymentSummary?: DeploymentSummary
    deploymentFailed?: boolean
    markdownViewMode?: MarkdownViewMode
    onBackToDashboard: ClickHandler
    onBack?: ClickHandler
    onTogglePrivate?: ClickHandler
    onRendererChange?: (renderer: RendererMode) => void
    onSave?: ClickHandler
    onUpload?: ClickHandler
    onPreview?: ClickHandler
    onDeploy?: ClickHandler
    onCopyLink?: () => void
    onCopyReference?: () => void
    onPathChange?: (path: string) => void
    onMarkdownViewChange?: (mode: MarkdownViewMode) => void
    onUpdate?: (file: FileRecord) => void
    onPurge?: (id: number) => void
  }

  let {
    file,
    pathValue = '',
    rendererValue = 'markdown',
    privateValue = false,
    changed = false,
    saving = false,
    savedAcknowledgement = false,
    conflict = null,
    showPreview = false,
    copyBtnText = 'Link',
    trashed = false,
    deploying = false,
    deploymentSummary = { status: 'not_applicable', deployedSourceHash: null, artifactHash: null },
    deploymentFailed = false,
    markdownViewMode = 'source',
    onBackToDashboard,
    onBack = noopClick,
    onTogglePrivate = noopClick,
    onRendererChange = () => {},
    onSave = noopClick,
    onUpload = noopClick,
    onPreview = noopClick,
    onDeploy = noopClick,
    onCopyLink = () => {},
    onCopyReference = () => {},
    onPathChange = () => {},
    onMarkdownViewChange = () => {},
    onUpdate,
    onPurge,
  }: Props = $props()

  const hasFile = $derived(file !== null)
  const hasPersistedFile = $derived((file?.id ?? 0) > 0)
  const unavailableTitle = 'Select a File from File Explorer first'
  const deployLabel = $derived(file && rendererValue === 'svelte'
    ? deployActionLabel({
        status: deploymentSummary.status,
        deploying,
        failed: deploymentFailed,
      })
    : null)
  const saveLabel = $derived(saving ? 'Saving…' : (savedAcknowledgement ? 'Saved' : (changed ? 'Save changes' : 'Save')))
  const saveDisabled = $derived(!hasFile || !changed || Boolean(conflict) || saving || savedAcknowledgement)
  const savePrimary = $derived(changed && !conflict && !saving && !savedAcknowledgement)
</script>

<div data-testid="editor-toolbar" class="editor-toolbar">
  <div class="editor-toolbar__navigation" aria-label="Workspace navigation">
    <button
      type="button"
      class="editor-tool-button"
      onclick={(event) => { event.preventDefault(); toggleSidebar() }}
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
    >
      <Menu size={20} />
    </button>
    <button
      type="button"
      class="editor-tool-button"
      onclick={onBack}
      disabled={!hasFile}
      aria-label="Back to previous File"
      title={hasFile ? 'Back to previous File' : unavailableTitle}
    >
      <ArrowLeft size={20} />
    </button>
  </div>

  <div class="editor-toolbar__context" title={pathValue || unavailableTitle} aria-label={hasFile ? `File Path ${pathValue}` : unavailableTitle}>
    <span class="editor-toolbar__context-mark" data-testid="editor-path-file-icon" data-renderer={rendererValue} aria-hidden="true">
      {#if rendererValue === 'svelte'}
        <SvelteIcon size={14} />
      {:else}
        <FileText size={14} />
      {/if}
    </span>
    <span class="editor-path-display">{pathValue || 'Select a File from File Explorer'}</span>
  </div>

  {#if hasFile && rendererValue === 'markdown'}
    <div class="editor-toolbar__view" role="group" aria-label="Markdown View">
      {#each ['source', 'split', 'preview'] as mode}
        <button
          type="button"
          class="editor-view-button"
          aria-pressed={markdownViewMode === mode}
          onclick={() => onMarkdownViewChange(mode as MarkdownViewMode)}
        >{mode}</button>
      {/each}
    </div>
  {/if}

  <div class="editor-toolbar__actions" aria-label="File actions">
    <button
      type="button"
      id="save"
      class="editor-tool-button {savePrimary ? 'editor-tool-button--primary' : ''}"
      onclick={onSave}
      disabled={saveDisabled}
      aria-label="Save File"
      title={!hasFile
        ? unavailableTitle
        : (conflict
            ? 'Resolve the Source conflict first'
            : (saving
                ? 'Saving Source'
                : (savedAcknowledgement ? 'Source saved' : (changed ? 'Save changes' : 'No Source changes to save'))))}
    >
      <Save size={18} />
      <span class="editor-tool-button__label">{saveLabel}</span>
    </button>
    {#if file && file.id > 0 && deployLabel}
      <button
        type="button"
        class="editor-tool-button editor-tool-button--deploy"
        onclick={onDeploy}
        disabled={changed || deploying}
        aria-label={deployLabel}
        title={changed ? 'Save Source before deploying' : deployLabel}
      >
        <RotateCw size={20} />
        <span class="editor-tool-button__label">{deployLabel}</span>
      </button>
    {/if}
    {#if hasFile && rendererValue === 'svelte'}
      <button
        type="button"
        id="preview"
        class="editor-tool-button"
        onclick={onPreview}
        disabled={trashed}
        aria-label={showPreview ? 'Edit Source' : 'Preview File'}
        title={showPreview ? 'Edit Source' : 'Preview File'}
      >
        {#if showPreview}<SquarePen size={20} />{:else}<Eye size={20} />{/if}
        <span class="editor-tool-button__label">{showPreview ? 'Edit' : 'Preview'}</span>
      </button>
    {/if}
    <EditorMoreMenu
      {file}
      {pathValue}
      {rendererValue}
      {privateValue}
      {trashed}
      {onBackToDashboard}
      {onTogglePrivate}
      {onRendererChange}
      {onUpload}
      {onCopyLink}
      {onCopyReference}
      {onPathChange}
      {onUpdate}
      {onPurge}
    />
  </div>
</div>
