<script lang="ts">
  import { getSourceFromPath, getMarkdownSourceKey } from '@/db'
  import type { FileRecord } from '@/db/types';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput } from '@/lib/services/file-reader';
  import { Save, Upload, Eye, SquarePen, Link, Check, ArrowLeft, Menu, Lock, LockOpen, House } from '@lucide/svelte';
  import DocumentLifecycle from './DocumentLifecycle.svelte';
  import { findPreviousActiveDocument, formatActionError, generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition, uploadEditorImage } from './utils';
  import { editorStore, upsertItem, popHistory, setCurrentMarkdown, setDraft, removeDraft, drafts, notify, toggleSidebar } from './store.svelte';

  interface Props {
			markdown: FileRecord;
	    onSave?: (file: FileRecord) => void;
	    onUpdate?: (file: FileRecord) => void;
	    onPurge?: (id: number) => void;
		}

  let editorForm: HTMLFormElement
  let { markdown, onSave, onUpdate, onPurge }: Props = $props()

  let textareaValue = $state(markdown.content ?? '')
  let privateValue = $state(markdown.private ?? false)
  let previewHtml = $state('')
  let pathValue = $state(markdown.path ?? '')
  let baseRevisionValue = $state(markdown.revision)
  let conflict = $state<FileRecord | null>(null)
  let titleValue = $derived(pathValue.split('/').filter(Boolean).at(-1) ?? '')
  let source = $derived(getSourceFromPath(pathValue))
  let trashed = $derived(Boolean(markdown.deletedAt))
  let changed = $derived(!trashed && drafts.has(markdown.path))

  $effect(() => {
    if (trashed) {
      return
    }

    const rawData = editorStore.items.find(i => markdown.id > 0 ? i.id === markdown.id : i.path === markdown.path)
    if (!rawData) return;

    const isDirty = pathValue !== rawData.path || textareaValue !== (rawData.content ?? '')
    if (isDirty) {
      setDraft(markdown.path, { ...markdown, title: titleValue, content: textareaValue, path: pathValue })
    } else {
      removeDraft(markdown.path)
    }
  })

  $effect(() => {
    const data = markdown

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
        `${window.location.origin}${markdown.path}`
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
      const prevItem = findPreviousActiveDocument(editorStore.history, editorStore.items);
        if (prevItem) {
            popHistory(); // Confirm pop
            setCurrentMarkdown(prevItem);
            return;
        }
    }

    const target = `/dashboard/${getMarkdownSourceKey(source)}`
    window.location.href = target
  }

  function conflictFromError(error: { code?: string; message: string }) {
    if (error.code !== 'CONFLICT') return null;
    try {
      const payload = JSON.parse(error.message) as { code?: string; current?: FileRecord };
      return payload.code === 'source_conflict' && payload.current ? payload.current : null;
    } catch {
      return null;
    }
  }

  function saveErrorMessage(error: { code?: string; message: string }) {
    if (error.code === 'CONFLICT') {
      try {
        const payload = JSON.parse(error.message) as { code?: string; path?: string };
        if (payload.code === 'path_conflict') return `Another active File already uses ${payload.path}.`;
      } catch {
        // Fall through to ordinary formatting.
      }
    }
    return formatActionError(error.message);
  }

  function useServerVersion() {
    if (!conflict || !window.confirm('Replace the local Edit Buffer with the current server File?')) return;
    removeDraft(markdown.path);
    markdown = conflict;
    onUpdate?.(conflict);
    setCurrentMarkdown(conflict);
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

    if (markdown.id > 0) {
      const formData = new FormData()
      formData.append('id', markdown.id.toString())
      formData.append('private', newPrivateValue.toString())
      formData.append('baseRevision', baseRevisionValue.toString())
      
      const result = await actions.form.setPrivate(formData)
      
      if (result.error) {
        conflict = conflictFromError(result.error);
        notify(conflict ? 'warning' : 'error', conflict ? 'The server File changed. Your local Edit Buffer was kept.' : saveErrorMessage(result.error))
      } else {
        if (result.data) {
          const updated = result.data
          baseRevisionValue = updated.revision;
          // Preserve current draft content when updating store
          const preserved = {
            ...updated,
            title: titleValue,
            content: textareaValue,
            path: pathValue,
          }
          markdown = preserved;
          upsertItem(updated)
          setCurrentMarkdown(preserved)
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
    formData.append('id', markdown.id.toString())
    formData.append('path', pathValue)
    formData.append('content', textareaValue)
    formData.append('private', String(privateValue));
    formData.append('baseRevision', baseRevisionValue.toString())

    const oldPath = markdown.path

    const result = await actions.form.save(formData)

    if (result.error) {
      conflict = conflictFromError(result.error);
      notify(conflict ? 'warning' : 'error', conflict ? 'The server File changed. Your local Edit Buffer was kept.' : saveErrorMessage(result.error))
    } else {
      notify('success', 'Saved Success', 3000)
      if (result.data) {
        markdown = result.data
        baseRevisionValue = markdown.revision;
        onSave?.(markdown)
        upsertItem(markdown)
        removeDraft(oldPath)
        removeDraft(markdown.path)
      }
    }
  }
</script>

<div class="w-full flex-1 flex flex-col pt-5">
  <form bind:this={editorForm} method="POST" class="flex-1 flex flex-col h-full overflow-hidden">
    <div class="flex justify-between items-center mb-2 gap-4 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <button 
          type="button"
          class="icon btn"
          onclick={(e) => { e.preventDefault(); toggleSidebar(); }}
        >
          <Menu size={20} />
        </button>
        <button 
          type="button"
          class="icon btn"
          onclick={backToDashboard}
        >
          <House size={20} />
        </button>
        <button class="icon btn {editorStore.history.length <= 1 ? 'hidden' : ''}" onclick={back}><ArrowLeft size={20} /></button>
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
          <DocumentLifecycle {markdown} {onUpdate} {onPurge} />
        {:else}
        <button
          type="button"
          class="icon btn {markdown.id > 0 ? '' : 'opacity-30 !cursor-not-allowed'}"
          onclick={togglePrivate}
          disabled={!(markdown.id > 0)}
          title={markdown.id > 0 ? (privateValue ? "Private" : "Public") : "Save first to set privacy"}
        >
          {#if privateValue}
            <Lock size={20} />
          {:else}
            <LockOpen size={20} />
          {/if}
        </button>
        <button id="save" class="icon btn {changed ? '!text-[--koala-success-text]' : '' }" onclick={save} disabled={Boolean(conflict)} title={conflict ? 'Resolve the Source conflict first' : 'Save'}><Save size={20} /></button>

        <button id="upload" class="icon btn" onclick={upload} title="Upload Image"><Upload size={20} /></button>
        <button id="preview" class="icon btn" onclick={preview} title="Toggle Preview">
        {#if showPreview}
            <SquarePen size={20} />
        {:else}
            <Eye size={20} />
        {/if}
        </button>
        {#if markdown.id > 0}
        <DocumentLifecycle {markdown} {onUpdate} {onPurge} />
        <button
            type="button"
            class="icon btn"
            onclick={copyLink}
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

    <input type="hidden" name="id" value={markdown.id} />
    <input type="hidden" name="baseRevision" value={baseRevisionValue} />

    <input
      id="title-input"
      type="text"
      class="text-[--koala-text] {showPreview ? 'hidden' : ''} w-full text-xl font-bold bg-transparent border-none outline-none border-b border-[--koala-border] pb-2 placeholder-[--koala-editor-placeholder]"
      value={titleValue}
      placeholder="Title"
      readonly
    />

    {#if conflict}
      <div class="mb-2 rounded border border-[--koala-warning-text] p-3 text-sm" role="alert">
        <p class="m-0">Server revision {conflict.revision} differs from the Edit Buffer base revision {baseRevisionValue}. The local Source is still intact.</p>
        <p class="m-0 mt-1 break-all">Server Path: {conflict.path}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn" onclick={useServerVersion}>Use server version</button>
          <button type="button" class="btn" onclick={retryLocalAgainstCurrentRevision}>Keep local and rebase</button>
        </div>
      </div>
    {/if}

    <textarea
      class="text-sm w-full flex-1 box-border bg-transparent border-none outline-none resize-none p-2 {showPreview ? 'hidden' : ''}" 
      name="content" 
      placeholder="Type here..."
      bind:value={textareaValue}
      onpaste={handlePaste}
      ondrop={handleDrop}
      readonly={trashed}
    ></textarea>

    <article id="preview-md" class="w-full flex-1 overflow-y-auto {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>

  </form>
</div>
