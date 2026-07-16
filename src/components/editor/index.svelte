<script lang="ts">
  import { getSourceFromPath, getMarkdownSourceKey } from '@/db'
  import type { FileRecord } from '@/db/types';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput } from '@/lib/services/file-reader';
  import { Save, Upload, Eye, SquarePen, Link, Check, ArrowLeft, Menu, Lock, LockOpen, House } from '@lucide/svelte';
  import FileLifecycle from './FileLifecycle.svelte';
  import EditorContent from './EditorContent.svelte';
  import { findPreviousActiveFile, formatFileSaveError, generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition, sourceConflictFromActionError, uploadEditorImage } from './utils';
  import { editorStore, upsertItem, popHistory, setCurrentFile, setDraft, removeDraft, drafts, notify, toggleSidebar } from './store.svelte';
  interface Props {
			file: FileRecord;
	    onSave?: (file: FileRecord) => void;
	    onUpdate?: (file: FileRecord) => void;
	    onPurge?: (id: number) => void;
			}
  let { file, onSave, onUpdate, onPurge }: Props = $props()
  let textareaValue = $state(file.content ?? '')
  let privateValue = $state(file.private ?? false)
  let previewHtml = $state('')
  let pathValue = $state(file.path ?? '')
  let baseRevisionValue = $state(file.revision)
  let conflict = $state<FileRecord | null>(null)
  let titleValue = $derived(pathValue.split('/').filter(Boolean).at(-1) ?? '')
  let source = $derived(getSourceFromPath(pathValue))
  let trashed = $derived(Boolean(file.deletedAt))
  let changed = $derived(!trashed && drafts.has(file.path))

  $effect(() => {
    if (trashed) {
      return
    }
    const rawData = editorStore.items.find(i => file.id > 0 ? i.id === file.id : i.path === file.path)
    if (!rawData) return;
    const isDirty = pathValue !== rawData.path || textareaValue !== (rawData.content ?? '')
    if (isDirty) {
      setDraft(file.path, { ...file, title: titleValue, content: textareaValue, path: pathValue })
    } else {
      removeDraft(file.path)
    }
  })

  $effect(() => {
    const data = file
    textareaValue = data.content ?? '';
    privateValue = data.private ?? false;
    pathValue = data.path ?? '';
    baseRevisionValue = data.revision;
    conflict = null;
  });

  $effect(() => {
     refreshPreview()
  })

  $effect(() => {
    document.title = `[Editor] ${titleValue || 'New File'}`
  })

  let mdInstance: MarkdownIt | null = null
  onMount(async () => {
    mdInstance = await md({ allFilePaths: editorStore.items.filter(item => !item.deletedAt).map(item => item.path) })
    refreshPreview()
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (!trashed && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save(e)
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  })

  $effect(() => {
      if (mdInstance && editorStore.items.length > 0) {
          md({ allFilePaths: editorStore.items.filter(item => !item.deletedAt).map(item => item.path) }).then(inst => {
              mdInstance = inst;
              refreshPreview();
          });
      }
  });

  async function refreshPreview() {
    let previewMd = textareaValue
    if (titleValue) {
      previewMd = `# ${titleValue}\n\n${textareaValue}`
    }
    if (mdInstance) {
      previewHtml = mdInstance.render(previewMd)
      setTimeout(() => {
        window.refreshCopyListener();
        window.refreshTagListener();
      }, 100)
    }
  }

  async function processFileUpload(file: File, placeholder?: string) {
    try {
      const markdownLink = await uploadEditorImage(file)
      textareaValue = placeholder
        ? textareaValue.replace(placeholder, markdownLink)
        : `${textareaValue}\n${markdownLink}`
      notify('success', 'Uploaded Successfully', 3000)
    } catch(e: any) {
      notify('error', e.message)
      if (placeholder) {
        // Remove placeholder on error
        textareaValue = textareaValue.replace(placeholder, '')
      }
    }
  }

  async function upload(e: Event) {
    e.preventDefault()
    const files = await pickFileWithFileInput()
    if (files.length > 0) {
      await processFileUpload(files[0])
    }
  }

  function handlePaste(e: ClipboardEvent) {
    if (trashed) return
    const files = getImagesFromClipboard(e)
    if (files.length > 0) {
      e.preventDefault()
      const textarea = e.target as HTMLTextAreaElement
      const startPos = textarea.selectionStart
      
      files.forEach(file => {
        const placeholder = generatePlaceholder(file.name)
        textareaValue = insertTextAtPosition(textareaValue, placeholder, startPos)
        
        // Start upload process
        processFileUpload(file, placeholder)
      })
    }
  }

  function handleDrop(e: DragEvent) {
    if (trashed) return
    const files = getImagesFromDrop(e)
    if (files.length > 0) {
      e.preventDefault()
      const textarea = e.target as HTMLTextAreaElement
      // Note: Drop position calculation is complex, here we simplify to inserting at current cursor or end
      // For better UX, we could use document.caretPositionFromPoint but it's not standard
      // So we fallback to selectionStart (where user clicked before drag) or simply append
      const startPos = textarea.selectionStart || textareaValue.length
      
      files.forEach(file => {
        const placeholder = generatePlaceholder(file.name)
        textareaValue = insertTextAtPosition(textareaValue, placeholder, startPos)
        processFileUpload(file, placeholder)
      })
    }
  }

  let showPreview = $state(false)
  function preview(e: Event) {
    e.preventDefault()
    showPreview = !showPreview
  }

  let copyBtnText = $state('Link')
  function copyLink() {  
    const supportClipboard = navigator && 'clipboard' in navigator
    if (supportClipboard) {
      navigator.clipboard.writeText(
        `${window.location.origin}${file.path}`
      ).then(() => {
        copyBtnText = 'Copied'
        setTimeout(() => {
          copyBtnText = 'Link'
        }, 2000)
      })
    }
  }

  function backToDashboard(e: Event) {
    e.preventDefault()

    window.location.href = '/dashboard'
  }

  function back(e: Event) {
    e.preventDefault()
    
    if (editorStore.history.length > 1) {
      const prevItem = findPreviousActiveFile(editorStore.history, editorStore.items);
        if (prevItem) {
            popHistory(); // Confirm pop
            setCurrentFile(prevItem);
            return;
        }
    }

    const target = `/dashboard/${getMarkdownSourceKey(source)}`
    window.location.href = target
  }

  function useServerVersion() {
    if (!conflict || !window.confirm('Replace the local Edit Buffer with the current server File?')) return;
    removeDraft(file.path);
    file = conflict;
    onUpdate?.(conflict);
    setCurrentFile(conflict);
  }

  function retryLocalAgainstCurrentRevision() {
    if (!conflict || !window.confirm(`Keep the local Edit Buffer and retry against server revision ${conflict.revision}?`)) return;
    baseRevisionValue = conflict.revision;
    upsertItem(conflict);
    conflict = null;
    notify('warning', 'Local Edit Buffer kept. Review it, then Save again.', 4000);
  }

  async function togglePrivate(e: Event) {
    e.preventDefault()
    if (trashed) return
    const newPrivateValue = !privateValue

    if (file.id > 0) {
      const formData = new FormData()
      formData.append('id', file.id.toString())
      formData.append('private', newPrivateValue.toString())
      formData.append('baseRevision', baseRevisionValue.toString())
      
      const result = await actions.form.setPrivate(formData)
      
      if (result.error) {
        conflict = sourceConflictFromActionError(result.error);
        notify(conflict ? 'warning' : 'error', conflict ? 'The server File changed. Your local Edit Buffer was kept.' : formatFileSaveError(result.error))
      } else {
        if (result.data) {
          const updated = result.data
          baseRevisionValue = updated.revision;
          // Preserve the current Edit Buffer when updating the store.
          const preserved = {
            ...updated,
            title: titleValue,
            content: textareaValue,
            path: pathValue,
          }
          file = preserved;
          upsertItem(updated)
          setCurrentFile(preserved)
        }
        privateValue = newPrivateValue
      }
    }
  }

  async function save(e: Event) {
    e.preventDefault()
    if (trashed) return
    if (conflict) {
      notify('warning', 'Resolve the Source conflict before saving again.', 4000);
      return;
    }

    const formData = new FormData()
    formData.append('id', file.id.toString())
    formData.append('path', pathValue)
    formData.append('content', textareaValue)
    formData.append('private', String(privateValue));
    formData.append('baseRevision', baseRevisionValue.toString())

    const oldPath = file.path

    const result = await actions.form.save(formData)

    if (result.error) {
      conflict = sourceConflictFromActionError(result.error);
      notify(conflict ? 'warning' : 'error', conflict ? 'The server File changed. Your local Edit Buffer was kept.' : formatFileSaveError(result.error))
    } else {
      notify('success', 'Saved Success', 3000)
      if (result.data) {
        file = result.data
        baseRevisionValue = file.revision;
        onSave?.(file)
        upsertItem(file)
        removeDraft(oldPath)
        removeDraft(file.path)
      }
    }
  }
</script>

<div class="w-full flex-1 flex flex-col pt-5">
  <form method="POST" class="flex-1 flex flex-col h-full overflow-hidden">
    <div class="flex justify-between items-center mb-2 gap-4 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <button 
          type="button"
          class="icon btn"
          onclick={(e) => { e.preventDefault(); toggleSidebar(); }}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <button 
          type="button"
          class="icon btn"
          onclick={backToDashboard}
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          <House size={20} />
        </button>
        <button type="button" class="icon btn {editorStore.history.length <= 1 ? 'hidden' : ''}" onclick={back} aria-label="Back to previous File" title="Back to previous File"><ArrowLeft size={20} /></button>
      </div>

      <div class="flex-1 max-w-xl mx-auto flex items-center gap-2 bg-[--koala-bg] rounded px-2">
        <input
          id="path-input"
          class="w-full bg-transparent border-none outline-none text-sm text-[--koala-subtext-0] h-8 text-center"
          type="text"
          name="path"
          bind:value={pathValue}
          onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Input Path..."
          readonly={trashed}
        />
      </div>

      <div class="flex items-center gap-1 shrink-0">
        {#if trashed}
          <FileLifecycle {file} {onUpdate} {onPurge} />
        {:else}
        <button
          type="button"
          class="icon btn {file.id > 0 ? '' : 'opacity-30 !cursor-not-allowed'}"
          onclick={togglePrivate}
          disabled={!(file.id > 0)}
          aria-label={file.id > 0 ? (privateValue ? "Make public" : "Make private") : "Save first to set privacy"}
          title={file.id > 0 ? (privateValue ? "Private" : "Public") : "Save first to set privacy"}
        >
          {#if privateValue}
            <Lock size={20} />
          {:else}
            <LockOpen size={20} />
          {/if}
        </button>
        <button id="save" class="icon btn {changed ? '!text-[--koala-success-text]' : '' }" onclick={save} disabled={Boolean(conflict)} aria-label="Save File" title={conflict ? 'Resolve the Source conflict first' : 'Save'}><Save size={20} /></button>

        <button id="upload" class="icon btn" onclick={upload} aria-label="Upload image" title="Upload Image"><Upload size={20} /></button>
        <button id="preview" class="icon btn" onclick={preview} aria-label={showPreview ? "Edit Source" : "Preview File"} title="Toggle Preview">
        {#if showPreview}
            <SquarePen size={20} />
        {:else}
            <Eye size={20} />
        {/if}
        </button>
        {#if file.id > 0}
        <FileLifecycle {file} {onUpdate} {onPurge} />
        <button
            type="button"
            class="icon btn"
            onclick={copyLink}
            aria-label="Copy File link"
            title="Copy Link"
        >
            {#if copyBtnText === 'Copied'}
            <Check size={20} />
            {:else}
            <Link size={20} />
            {/if}
        </button>
        {/if}
        {/if}
      </div>
    </div>

    <EditorContent
      title={titleValue}
      bind:value={textareaValue}
      {showPreview}
      {previewHtml}
      {trashed}
      {conflict}
      baseRevision={baseRevisionValue}
      onUseServer={useServerVersion}
      onRebase={retryLocalAgainstCurrentRevision}
      onPaste={handlePaste}
      onDrop={handleDrop}
    />
  </form>
</div>
