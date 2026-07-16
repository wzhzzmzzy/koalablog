<script lang="ts">
  import type { Markdown } from '@/db/types';
  import { actions } from 'astro:actions';
  import { RotateCcw, Trash2, X } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { notify, removeDraft } from './store.svelte';

  interface Props {
    markdown: Markdown;
    onUpdate?: (markdown: Markdown) => void;
    onPurge?: (id: number) => void;
  }

  let { markdown, onUpdate, onPurge }: Props = $props();
  let showTrashConfirm = $state(false);
  let showPurgeConfirm = $state(false);
  let restoreConflict = $state<{ suggestedLink: string; suggestedSubject: string } | null>(null);
  let activeDialog: HTMLDivElement | undefined = $state();
  const trashed = $derived(Boolean(markdown.deletedAt));
  const dialogTitleId = $derived(`document-lifecycle-dialog-${markdown.id}`);

  async function focusDialog() {
    await tick();
    activeDialog?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function closeDialogs() {
    showTrashConfirm = false;
    showPurgeConfirm = false;
    restoreConflict = null;
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeDialogs();
  }

  async function openTrashConfirm() {
    showTrashConfirm = true;
    await focusDialog();
  }

  async function openPurgeConfirm() {
    showPurgeConfirm = true;
    await focusDialog();
  }

  async function trashDocument() {
    const result = await actions.db.markdown.trash({ id: markdown.id });
    if (result.error || !result.data || result.data.status !== 'trashed') {
      notify('error', result.error?.message || 'Document was not found');
      return;
    }

    closeDialogs();
    removeDraft(markdown.link);
    onUpdate?.(result.data.document);
    notify('success', 'Moved to recycle bin', 3000);
  }

  async function restoreDocument(renameOnConflict = false) {
    const result = await actions.db.markdown.restore({ id: markdown.id, renameOnConflict });
    if (result.error || !result.data) {
      notify('error', result.error?.message || 'Restore failed');
      return;
    }
    if (result.data.status === 'conflict') {
      restoreConflict = {
        suggestedLink: result.data.suggestedLink,
        suggestedSubject: result.data.suggestedSubject,
      };
      await focusDialog();
      return;
    }
    if (result.data.status !== 'restored') {
      notify('error', 'Document was not found');
      return;
    }

    closeDialogs();
    onUpdate?.(result.data.document);
    notify('success', `Restored as ${result.data.document.link}`, 3000);
  }

  async function purgeDocument() {
    const result = await actions.db.markdown.purge({ id: markdown.id });
    if (result.error || result.data?.status !== 'purged') {
      notify('error', result.error?.message || 'Document was not found');
      return;
    }

    closeDialogs();
    onPurge?.(markdown.id);
    notify('success', 'Permanently deleted', 3000);
  }
</script>

{#if trashed}
  <button type="button" class="icon btn" onclick={() => restoreDocument(false)} aria-label="Restore" title="Restore">
    <RotateCcw size={20} />
  </button>
  <button type="button" class="icon !text-[--koala-error-text] btn" onclick={openPurgeConfirm} aria-label="Permanently delete" title="Permanently delete">
    <Trash2 size={20} />
  </button>
{:else if markdown.id > 0}
  <button type="button" class="icon !text-[--koala-error-text] btn" onclick={openTrashConfirm} aria-label="Move to recycle bin" title="Move to recycle bin">
    <Trash2 size={20} />
  </button>
{/if}

{#if showTrashConfirm}
  <div
    bind:this={activeDialog}
    class="fixed inset-0 bg-[--koala-catppuccin-crust] flex items-center justify-center z-50"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby={dialogTitleId}
    onkeydown={handleDialogKeydown}
  >
    <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[90vw] sm:max-w-md sm:w-full">
      <h3 id={dialogTitleId} class="text-xl font-bold mb-4">Move to recycle bin?</h3>
      <p class="mb-6">The document can be restored later.</p>
      <div class="flex justify-end gap-3">
        <button type="button" class="icon btn" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
        <button type="button" class="icon !text-[--koala-error-text] btn" onclick={trashDocument} aria-label="Move to recycle bin">
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showPurgeConfirm}
  <div
    bind:this={activeDialog}
    class="fixed inset-0 bg-[--koala-catppuccin-crust] flex items-center justify-center z-50"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby={dialogTitleId}
    onkeydown={handleDialogKeydown}
  >
    <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[90vw] sm:max-w-md sm:w-full">
      <h3 id={dialogTitleId} class="text-xl font-bold mb-4">Permanently delete?</h3>
      <p class="mb-6">This cannot be undone. Other documents with the same name will not be affected.</p>
      <div class="flex justify-end gap-3">
        <button type="button" class="icon btn" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
        <button type="button" class="icon !text-[--koala-error-text] btn" onclick={purgeDocument} aria-label="Permanently delete">
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  </div>
{/if}

{#if restoreConflict}
  <div
    bind:this={activeDialog}
    class="fixed inset-0 bg-[--koala-catppuccin-crust] flex items-center justify-center z-50"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby={dialogTitleId}
    onkeydown={handleDialogKeydown}
  >
    <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[90vw] sm:max-w-md sm:w-full">
      <h3 id={dialogTitleId} class="text-xl font-bold mb-4">Name already in use</h3>
      <p class="mb-2">Another active document uses this path or title.</p>
      <p class="mb-6 text-sm text-[--koala-subtext-0] break-all">
        Restore as {restoreConflict.suggestedLink} with title “{restoreConflict.suggestedSubject}”.
      </p>
      <div class="flex justify-end gap-3">
        <button type="button" class="icon btn" onclick={closeDialogs} aria-label="Cancel"><X size={20} /></button>
        <button type="button" class="btn flex items-center gap-2" onclick={() => restoreDocument(true)}>
          <RotateCcw size={20} />
          <span>Restore renamed</span>
        </button>
      </div>
    </div>
  </div>
{/if}
