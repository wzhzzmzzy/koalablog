<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import type { RendererMode } from '@/lib/files/types';
  import { ArrowLeft, Check, Eye, FileText, House, Link, Lock, LockOpen, Menu, RotateCw, Save, SquarePen, Trash2, Upload } from '@lucide/svelte';
  import FileLifecycle from './FileLifecycle.svelte';
  import type { EditBufferServerValues } from './edit-buffer.svelte';
  import SvelteIcon from './SvelteIcon.svelte';
  import RendererToggle from './svelte/RendererToggle.svelte';
  import { editorStore, toggleSidebar } from './store.svelte';

  type ClickHandler = (event: MouseEvent) => void | Promise<void>;
  const noopClick: ClickHandler = () => {};

  interface Props {
    file: FileRecord | null;
    pathValue?: string;
    rendererValue?: RendererMode;
    privateValue?: boolean;
    changed?: boolean;
    conflict?: EditBufferServerValues | null;
    showPreview?: boolean;
    copyBtnText?: string;
    trashed?: boolean;
    deploying?: boolean;
    onBackToDashboard: ClickHandler;
    onBack?: ClickHandler;
    onTogglePrivate?: ClickHandler;
    onRendererChange?: (renderer: RendererMode) => void;
    onSave?: ClickHandler;
    onUpload?: ClickHandler;
    onPreview?: ClickHandler;
    onDeploy?: ClickHandler;
    onCopyLink?: () => void;
    onUpdate?: (file: FileRecord) => void;
    onPurge?: (id: number) => void;
  }

  let {
    file,
    pathValue = $bindable(''),
    rendererValue = 'markdown',
    privateValue = false,
    changed = false,
    conflict = null,
    showPreview = false,
    copyBtnText = 'Link',
    trashed = false,
    deploying = false,
    onBackToDashboard,
    onBack = noopClick,
    onTogglePrivate = noopClick,
    onRendererChange = () => {},
    onSave = noopClick,
    onUpload = noopClick,
    onPreview = noopClick,
    onDeploy = noopClick,
    onCopyLink = () => {},
    onUpdate,
    onPurge,
  }: Props = $props();

  const hasFile = $derived(file !== null);
  const hasPersistedFile = $derived((file?.id ?? 0) > 0);
  const hasPreviousFile = $derived(hasFile && editorStore.history.length > 1);
  const unavailableTitle = 'Select a File from File Explorer first';
  const rendererDisabledReason = $derived(hasFile && trashed
    ? 'Renderer cannot be changed for a recycled File'
    : unavailableTitle);
</script>

<div data-testid="editor-toolbar" class="editor-toolbar">
  <div class="editor-toolbar__navigation" aria-label="Workspace navigation">
    <button
      type="button"
      class="editor-tool-button"
      onclick={(event) => { event.preventDefault(); toggleSidebar(); }}
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
    >
      <Menu size={20} />
    </button>
    <button
      type="button"
      class="editor-tool-button"
      onclick={onBackToDashboard}
      aria-label="Back to dashboard"
      title="Back to dashboard"
    >
      <House size={20} />
    </button>
    <button
      type="button"
      class="editor-tool-button"
      onclick={onBack}
      disabled={!hasPreviousFile}
      aria-label="Back to previous File"
      title={hasPreviousFile ? 'Back to previous File' : (hasFile ? 'No previous File in history' : unavailableTitle)}
    >
      <ArrowLeft size={20} />
    </button>
  </div>

  <div class="editor-toolbar__context">
    <span class="editor-toolbar__context-mark" data-testid="editor-path-file-icon" data-renderer={rendererValue} aria-hidden="true">
      {#if rendererValue === 'svelte'}
        <SvelteIcon size={14} />
      {:else}
        <FileText size={14} />
      {/if}
    </span>
    <input
      id="path-input"
      class="editor-path-input"
      type="text"
      name="path"
      aria-label="Absolute File Path"
      bind:value={pathValue}
      onkeydown={(event) => event.key === 'Enter' && event.preventDefault()}
      placeholder={hasFile ? 'Input Path...' : 'Select a File from File Explorer'}
      readonly={trashed}
      disabled={!hasFile}
      title={hasFile ? undefined : unavailableTitle}
    />
  </div>

  <div class="editor-toolbar__renderer">
    <RendererToggle
      value={rendererValue}
      disabled={!hasFile || trashed}
      disabledReason={rendererDisabledReason}
      onChange={onRendererChange}
    />
  </div>

  <div class="editor-toolbar__actions" aria-label="File actions">
    {#if trashed && file}
      <FileLifecycle {file} {onUpdate} {onPurge} />
    {:else}
      <button
        type="button"
        class="editor-tool-button"
        onclick={onTogglePrivate}
        disabled={!hasPersistedFile}
        aria-label={hasPersistedFile ? (privateValue ? 'Make public' : 'Make private') : 'Set File privacy'}
        title={hasPersistedFile ? (privateValue ? 'Private' : 'Public') : unavailableTitle}
      >
        {#if privateValue}
          <Lock size={20} />
        {:else}
          <LockOpen size={20} />
        {/if}
      </button>
      <button
        type="button"
        id="save"
        class="editor-tool-button {changed ? 'editor-tool-button--changed' : 'editor-tool-button--primary'}"
        onclick={onSave}
        disabled={!hasFile || Boolean(conflict)}
        aria-label="Save File"
        title={!hasFile ? unavailableTitle : (conflict ? 'Resolve the Source conflict first' : (changed ? 'Save changes' : 'Save File'))}
      >
        <Save size={18} />
        <span class="editor-tool-button__label">Save</span>
      </button>
      <button
        type="button"
        id="upload"
        class="editor-tool-button"
        onclick={onUpload}
        disabled={!hasFile}
        aria-label="Upload image"
        title={!hasFile ? unavailableTitle : 'Upload Image'}
      >
        <Upload size={20} />
      </button>
      {#if file && rendererValue === 'svelte' && file.id > 0}
        <button
          type="button"
          class="editor-tool-button editor-tool-button--deploy"
          onclick={onDeploy}
          disabled={changed || deploying}
          aria-label="Deploy Svelte File"
          title={changed ? 'Save Source before deploying' : (deploying ? 'Deploying Svelte File' : 'Deploy Svelte File')}
        >
          <RotateCw size={20} />
          <span class="editor-tool-button__label">Deploy</span>
        </button>
      {/if}
      <button
        type="button"
        id="preview"
        class="editor-tool-button"
        onclick={onPreview}
        disabled={!hasFile}
        aria-label={showPreview ? 'Edit Source' : 'Preview File'}
        title={!hasFile ? unavailableTitle : 'Toggle Preview'}
      >
        {#if showPreview}
          <SquarePen size={20} />
        {:else}
          <Eye size={20} />
        {/if}
      </button>
      {#if file && hasPersistedFile}
        <FileLifecycle {file} {onUpdate} {onPurge} />
        <button
          type="button"
          class="editor-tool-button"
          onclick={onCopyLink}
          aria-label="Copy File link"
          title="Copy Link"
        >
          {#if copyBtnText === 'Copied'}
            <Check size={20} />
          {:else}
            <Link size={20} />
          {/if}
        </button>
      {:else}
        <button
          type="button"
          class="editor-tool-button"
          disabled
          aria-label="Move to recycle bin"
          title={unavailableTitle}
        >
          <Trash2 size={20} />
        </button>
        <button
          type="button"
          class="editor-tool-button"
          disabled
          aria-label="Copy File link"
          title={unavailableTitle}
        >
          <Link size={20} />
        </button>
      {/if}
    {/if}
  </div>
</div>
