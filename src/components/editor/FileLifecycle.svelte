<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import { actions } from 'astro:actions';
  import { RotateCcw, Trash2, X } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { removeEditBuffer } from './edit-buffer.svelte';
  import { notify } from './store.svelte';

  interface Props {
    file: FileRecord;
    onUpdate?: (file: FileRecord) => void;
    onPurge?: (id: number) => void;
    menuItem?: boolean;
    onBeforeDialogOpen?: () => void;
  }

  let { file, onUpdate, onPurge, menuItem = false, onBeforeDialogOpen }: Props = $props();
  let showTrashConfirm = $state(false);
  let showPurgeConfirm = $state(false);
  let restoreConflict = $state<{ suggestedPath: string; suggestedTitle: string } | null>(null);
  let activeDialog: HTMLDialogElement | undefined = $state();
  const trashed = $derived(Boolean(file.deletedAt));
  const dialogTitleId = $derived(`file-lifecycle-dialog-${file.id}`);

  function portal(dialog: HTMLDialogElement) {
    document.body.append(dialog);
    return {
      destroy() {
        dialog.remove();
      },
    };
  }

  async function focusDialog() {
    await tick();
    if (activeDialog && !activeDialog.open)
      activeDialog.showModal();
    activeDialog?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function closeDialogs() {
    if (activeDialog?.open)
      activeDialog.close();
    showTrashConfirm = false;
    showPurgeConfirm = false;
    restoreConflict = null;
  }

  function handleDialogCancel(event: Event) {
    event.preventDefault();
    closeDialogs();
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === activeDialog)
      closeDialogs();
  }

  async function openTrashConfirm() {
    onBeforeDialogOpen?.();
    showTrashConfirm = true;
    await focusDialog();
  }

  async function openPurgeConfirm() {
    onBeforeDialogOpen?.();
    showPurgeConfirm = true;
    await focusDialog();
  }

  async function trashFile() {
    const result = await actions.db.markdown.trash({ id: file.id });
    if (result.error || !result.data || result.data.status !== 'trashed') {
      notify('error', result.error?.message || 'File was not found');
      return;
    }

    closeDialogs();
    removeEditBuffer(file.id);
    onUpdate?.(result.data.file);
    notify('success', 'Moved to recycle bin', 3000);
  }

  async function restoreFile(renameOnConflict = false) {
    if (!renameOnConflict)
      onBeforeDialogOpen?.();
    const result = await actions.db.markdown.restore({ id: file.id, renameOnConflict });
    if (result.error || !result.data) {
      notify('error', result.error?.message || 'Restore failed');
      return;
    }
    if (result.data.status === 'conflict') {
      restoreConflict = {
        suggestedPath: result.data.suggestedPath,
        suggestedTitle: result.data.suggestedTitle,
      };
      await focusDialog();
      return;
    }
    if (result.data.status === 'invalid_path') {
      notify('error', `Cannot restore invalid legacy Path: ${result.data.path}`);
      return;
    }
    if (result.data.status !== 'restored') {
      notify('error', 'File was not found');
      return;
    }

    closeDialogs();
    onUpdate?.(result.data.file);
    notify('success', `Restored as ${result.data.file.path}`, 3000);
  }

  async function purgeFile() {
    const result = await actions.db.markdown.purge({ id: file.id });
    if (result.error || result.data?.status !== 'purged') {
      notify('error', result.error?.message || 'File was not found');
      return;
    }

    closeDialogs();
    onPurge?.(file.id);
    notify('success', 'Permanently deleted', 3000);
  }
</script>

{#if trashed}
  <button type="button" role={menuItem ? 'menuitem' : undefined} class="editor-tool-button {menuItem ? 'editor-more__item' : ''}" onclick={() => restoreFile(false)} aria-label="Restore" title="Restore">
    <RotateCcw size={20} />
    {#if menuItem}<span>Restore</span>{/if}
  </button>
  <button type="button" role={menuItem ? 'menuitem' : undefined} class="editor-tool-button editor-tool-button--danger {menuItem ? 'editor-more__item' : ''}" onclick={openPurgeConfirm} aria-label="Permanently delete" title="Permanently delete">
    <Trash2 size={20} />
    {#if menuItem}<span>Permanently delete</span>{/if}
  </button>
{:else if file.id > 0}
  <button type="button" role={menuItem ? 'menuitem' : undefined} class="editor-tool-button editor-tool-button--danger {menuItem ? 'editor-more__item' : ''}" onclick={openTrashConfirm} aria-label="Move to recycle bin" title="Move to recycle bin">
    <Trash2 size={20} />
    {#if menuItem}<span>Move to recycle bin</span>{/if}
  </button>
{/if}

{#if showTrashConfirm}
  <dialog
    bind:this={activeDialog}
    use:portal
    class="editor-modal"
    aria-labelledby={dialogTitleId}
    onclose={closeDialogs}
    oncancel={handleDialogCancel}
    onclick={handleDialogClick}
  >
    <h3 id={dialogTitleId}>Move to recycle bin?</h3>
    <p>The File can be restored later.</p>
    <div class="editor-modal__actions">
      <button type="button" class="editor-tool-button" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
      <button type="button" class="editor-tool-button editor-tool-button--danger" onclick={trashFile} aria-label="Move to recycle bin">
        <Trash2 size={20} />
      </button>
    </div>
  </dialog>
{/if}

{#if showPurgeConfirm}
  <dialog
    bind:this={activeDialog}
    use:portal
    class="editor-modal"
    aria-labelledby={dialogTitleId}
    onclose={closeDialogs}
    oncancel={handleDialogCancel}
    onclick={handleDialogClick}
  >
    <h3 id={dialogTitleId}>Permanently delete?</h3>
    <p>This cannot be undone. Other Files with the same Title will not be affected.</p>
    <div class="editor-modal__actions">
      <button type="button" class="editor-tool-button" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
      <button type="button" class="editor-tool-button editor-tool-button--danger" onclick={purgeFile} aria-label="Permanently delete">
        <Trash2 size={20} />
      </button>
    </div>
  </dialog>
{/if}

{#if restoreConflict}
  <dialog
    bind:this={activeDialog}
    use:portal
    class="editor-modal"
    aria-labelledby={dialogTitleId}
    onclose={closeDialogs}
    oncancel={handleDialogCancel}
    onclick={handleDialogClick}
  >
    <h3 id={dialogTitleId}>Name already in use</h3>
    <p>Another active File uses this Path.</p>
    <p class="break-all">
      Restore as {restoreConflict.suggestedPath} with Title “{restoreConflict.suggestedTitle}”.
    </p>
    <div class="editor-modal__actions">
      <button type="button" class="editor-tool-button" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
      <button type="button" class="editor-conflict__button" onclick={() => restoreFile(true)}>
        <RotateCcw size={20} />
        <span>Restore renamed</span>
      </button>
    </div>
  </dialog>
{/if}
