<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import type { RendererMode } from '@/lib/files/types';
  import { ArrowLeft, Check, Eye, House, Link, Lock, LockOpen, Menu, RotateCw, Save, SquarePen, Trash2, Upload } from '@lucide/svelte';
  import FileLifecycle from './FileLifecycle.svelte';
  import type { EditBufferServerValues } from './edit-buffer.svelte';
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
    onBackToDashboard: ClickHandler;
    onBack?: ClickHandler;
    onTogglePrivate?: ClickHandler;
    onRendererChange?: (renderer: RendererMode) => void;
    onSave?: ClickHandler;
    onUpload?: ClickHandler;
    onPreview?: ClickHandler;
    onRebuild?: ClickHandler;
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
    onBackToDashboard,
    onBack = noopClick,
    onTogglePrivate = noopClick,
    onRendererChange = () => {},
    onSave = noopClick,
    onUpload = noopClick,
    onPreview = noopClick,
    onRebuild = noopClick,
    onCopyLink = () => {},
    onUpdate,
    onPurge,
  }: Props = $props();

  const hasFile = $derived(file !== null);
  const hasPersistedFile = $derived((file?.id ?? 0) > 0);
  const unavailableTitle = 'Select a File from File Explorer first';
  const rendererDisabledReason = $derived(hasFile && trashed
    ? 'Renderer cannot be changed for a recycled File'
    : unavailableTitle);
</script>

<div data-testid="editor-toolbar" class="flex flex-wrap md:flex-nowrap justify-between items-center mb-2 gap-2 md:gap-4 shrink-0">
  <div class="flex items-center gap-2 shrink-0">
    <button
      type="button"
      class="icon btn"
      onclick={(event) => { event.preventDefault(); toggleSidebar(); }}
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
    >
      <Menu size={20} />
    </button>
    <button
      type="button"
      class="icon btn"
      onclick={onBackToDashboard}
      aria-label="Back to dashboard"
      title="Back to dashboard"
    >
      <House size={20} />
    </button>
    {#if hasFile && editorStore.history.length > 1}
      <button
        type="button"
        class="icon btn"
        onclick={onBack}
        aria-label="Back to previous File"
        title="Back to previous File"
      >
        <ArrowLeft size={20} />
      </button>
    {:else if !hasFile}
      <button
        type="button"
        class="icon btn opacity-30 !cursor-not-allowed"
        disabled
        aria-label="Back to previous File"
        title={unavailableTitle}
      >
        <ArrowLeft size={20} />
      </button>
    {/if}
  </div>

  <div class="order-last basis-full w-full md:order-none md:basis-auto md:w-auto flex-1 max-w-xl mx-auto flex items-center gap-2 bg-[--koala-bg] rounded px-2">
    <input
      id="path-input"
      class="w-full bg-transparent border-none outline-none text-sm text-[--koala-subtext-0] h-8 text-center"
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

  <div class="flex flex-wrap justify-end items-center gap-0 md:gap-1 md:shrink-0">
    <RendererToggle
      value={rendererValue}
      disabled={!hasFile || trashed}
      disabledReason={rendererDisabledReason}
      onChange={onRendererChange}
    />
    {#if trashed && file}
      <FileLifecycle {file} {onUpdate} {onPurge} />
    {:else}
      <button
        type="button"
        class="icon btn {hasPersistedFile ? '' : 'opacity-30 !cursor-not-allowed'}"
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
        id="save"
        class="icon btn {changed ? '!text-[--koala-success-text]' : ''} {!hasFile ? 'opacity-30 !cursor-not-allowed' : ''}"
        onclick={onSave}
        disabled={!hasFile || Boolean(conflict)}
        aria-label="Save File"
        title={!hasFile ? unavailableTitle : (conflict ? 'Resolve the Source conflict first' : 'Save')}
      >
        <Save size={20} />
      </button>
      <button
        id="upload"
        class="icon btn {!hasFile ? 'opacity-30 !cursor-not-allowed' : ''}"
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
          class="icon btn"
          onclick={onRebuild}
          aria-label="Rebuild Svelte Artifact"
          title={changed ? 'Save Source before rebuilding' : 'Rebuild Svelte Artifact'}
        >
          <RotateCw size={20} />
        </button>
      {/if}
      <button
        id="preview"
        class="icon btn {!hasFile ? 'opacity-30 !cursor-not-allowed' : ''}"
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
      {#if file && file.id > 0}
        <FileLifecycle {file} {onUpdate} {onPurge} />
        <button
          type="button"
          class="icon btn"
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
      {:else if !file}
        <button
          type="button"
          class="icon btn opacity-30 !cursor-not-allowed"
          disabled
          aria-label="Move to recycle bin"
          title={unavailableTitle}
        >
          <Trash2 size={20} />
        </button>
        <button
          type="button"
          class="icon btn opacity-30 !cursor-not-allowed"
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
