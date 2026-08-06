<script lang="ts">
  import type { FileRecord } from '@/db/types'
  import type { RendererMode } from '@/lib/files/types'
  import { Code2, Copy, Ellipsis, FileText, House, Link, Lock, LockOpen, Upload } from '@lucide/svelte'
  import { tick } from 'svelte'
  import FileLifecycle from './FileLifecycle.svelte'

  type ClickHandler = (event: MouseEvent) => void | Promise<void>
  const noopClick: ClickHandler = () => {}

  interface Props {
    file: FileRecord | null
    rendererValue: RendererMode
    privateValue: boolean
    trashed: boolean
    onBackToDashboard: ClickHandler
    onTogglePrivate?: ClickHandler
    onRendererChange: (renderer: RendererMode) => void
    onUpload?: ClickHandler
    onCopyLink: () => void
    onCopyReference: () => void
    onUpdate?: (file: FileRecord) => void
    onPurge?: (id: number) => void
  }

  let {
    file,
    rendererValue,
    privateValue,
    trashed,
    onBackToDashboard,
    onTogglePrivate = noopClick,
    onRendererChange,
    onUpload = noopClick,
    onCopyLink,
    onCopyReference,
    onUpdate,
    onPurge,
  }: Props = $props()

  let open = $state(false)
  let menu: HTMLDivElement | undefined = $state()
  let trigger: HTMLButtonElement | undefined = $state()

  const hasPersistedFile = $derived((file?.id ?? 0) > 0)
  const unavailableTitle = 'Select a File from File Explorer first'

  async function openMenu() {
    open = true
    await tick()
    menu?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus()
  }

  function closeMenu() {
    open = false
    trigger?.focus()
  }

  function toggleMenu() {
    if (open)
      closeMenu()
    else
      void openMenu()
  }

  function moveMenuFocus(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return
    const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])
    if (items.length === 0)
      return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  function chooseRenderer(renderer: RendererMode) {
    if (!trashed && renderer !== rendererValue)
      onRendererChange(renderer)
    closeMenu()
  }

  function act(handler: () => void) {
    handler()
    closeMenu()
  }
</script>

<div class="editor-more">
  <button
    bind:this={trigger}
    type="button"
    class="editor-tool-button"
    aria-label="More File actions"
    aria-haspopup="menu"
    aria-expanded={open}
    title="More File actions"
    onclick={toggleMenu}
  >
    <Ellipsis size={20} />
    <span class="editor-tool-button__label">More</span>
  </button>

  <div
    bind:this={menu}
    class:editor-more__menu--open={open}
    class="editor-more__menu"
    role="menu"
    aria-label="More File actions"
    aria-hidden={!open}
    onkeydown={moveMenuFocus}
  >
    <button type="button" role="menuitem" class="editor-more__item" onclick={(event) => { closeMenu(); onBackToDashboard(event); }}>
      <House size={16} />
      <span>Back to Dashboard</span>
    </button>

    <div class="editor-more__section" role="group" aria-label="Renderer Mode">
      <p>Renderer Mode</p>
      <button
        type="button"
        role="menuitemradio"
        class="editor-more__item"
        aria-checked={rendererValue === 'markdown'}
        disabled={!hasPersistedFile || trashed}
        onclick={() => chooseRenderer('markdown')}
      >
        <FileText size={16} />
        <span>Markdown</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        class="editor-more__item"
        aria-checked={rendererValue === 'svelte'}
        disabled={!hasPersistedFile || trashed}
        onclick={() => chooseRenderer('svelte')}
      >
        <Code2 size={16} />
        <span>Svelte</span>
      </button>
    </div>

    <div class="editor-more__separator"></div>

    {#if !trashed}
      <button
        type="button"
        role="menuitem"
        class="editor-more__item"
        disabled={!hasPersistedFile}
        onclick={(event) => act(() => void onTogglePrivate(event))}
      >
        {#if privateValue}<Lock size={16} />{:else}<LockOpen size={16} />{/if}
        <span>{privateValue ? 'Make public' : 'Make private'}</span>
      </button>
      <button type="button" role="menuitem" class="editor-more__item" disabled={!hasPersistedFile} onclick={(event) => act(() => void onUpload(event))}>
        <Upload size={16} />
        <span>Upload Image</span>
      </button>
      <button type="button" role="menuitem" class="editor-more__item" disabled={!hasPersistedFile} onclick={() => act(onCopyLink)}>
        <Link size={16} />
        <span>Copy public link</span>
      </button>
      <button type="button" role="menuitem" class="editor-more__item" disabled={!hasPersistedFile} onclick={() => act(onCopyReference)}>
        <Copy size={16} />
        <span>Copy File Reference</span>
      </button>
    {/if}

    {#if file && hasPersistedFile}
      <div class="editor-more__separator"></div>
      <div class="editor-more__lifecycle">
        <FileLifecycle {file} {onUpdate} {onPurge} menuItem onBeforeDialogOpen={closeMenu} />
      </div>
    {/if}
  </div>
</div>
