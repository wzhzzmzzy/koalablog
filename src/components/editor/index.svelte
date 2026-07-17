<script lang="ts">
  import { getSourceFromPath, getMarkdownSourceKey } from '@/db'
  import type { FileRecord } from '@/db/types';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput } from '@/lib/services/file-reader';
  import EditorContent from './EditorContent.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import { findPreviousActiveFile, formatFileSaveError, generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition, sourceConflictFromActionError, uploadEditorImage } from './utils';
  import { editorStore, editBuffers, upsertItem, popHistory, setCurrentFile, setEditBuffer, removeEditBuffer, notify, type EditBufferServerValues } from './store.svelte';
  interface Props {
			file: FileRecord;
	    onSave?: (file: FileRecord) => void;
	    onUpdate?: (file: FileRecord) => void;
	    onPurge?: (id: number) => void;
			}
  let { file, onSave, onUpdate, onPurge }: Props = $props()
  const initialBuffer = editBuffers.get(file.id)
  let textareaValue = $state(initialBuffer?.content ?? file.content ?? '')
  let privateValue = $state(initialBuffer?.private ?? file.private ?? false)
  let previewHtml = $state('')
  let pathValue = $state(initialBuffer?.path ?? file.path ?? '')
  let baseRevisionValue = $state(initialBuffer?.baseRevision ?? file.revision)
  let conflict = $state<EditBufferServerValues | null>(initialBuffer?.conflict?.server ?? null)
  let titleValue = $derived(pathValue.split('/').filter(Boolean).at(-1) ?? '')
  let source = $derived(getSourceFromPath(pathValue))
  let trashed = $derived(Boolean(file.deletedAt))
  let changed = $derived(!trashed && Boolean(editBuffers.get(file.id)?.dirty))

  function isDirtyAgainst(server: FileRecord) {
    return pathValue !== server.path
      || textareaValue !== (server.content ?? '')
      || privateValue !== server.private
  }

  function syncEditBuffer(server: FileRecord) {
    const dirty = isDirtyAgainst(server)
    if (dirty || conflict) {
      setEditBuffer({
        fileId: server.id,
        path: pathValue,
        content: textareaValue,
        private: privateValue,
        baseRevision: baseRevisionValue,
        dirty,
        conflict: conflict ? { server: conflict } : null,
      })
    }
    else {
      removeEditBuffer(server.id)
    }
  }

  $effect(() => {
    if (trashed)
      return
    const server = editorStore.items.find(item => item.id === file.id) ?? file
    syncEditBuffer(server)
  })

  // Hydrate the newly selected File before the persistence effect can observe
  // the old File's local values under the new stable ID.
  $effect.pre(() => {
    const data = file
    const buffer = editBuffers.get(data.id)
    textareaValue = buffer?.content ?? data.content ?? '';
    privateValue = buffer?.private ?? data.private ?? false;
    pathValue = buffer?.path ?? data.path ?? '';
    baseRevisionValue = buffer?.baseRevision ?? data.revision;
    conflict = buffer?.conflict?.server ?? null;
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
    const server = editorStore.items.find(item => item.id === file.id)
    if (!server) return;
    removeEditBuffer(file.id);
    conflict = null;
    file = server;
    onUpdate?.(server);
    setCurrentFile(server);
  }

  function retryLocalAgainstCurrentRevision() {
    if (!conflict || !window.confirm(`Keep the local Edit Buffer and retry against server revision ${conflict.revision}?`)) return;
    baseRevisionValue = conflict.revision;
    conflict = null;
    const server = editorStore.items.find(item => item.id === file.id)
    if (server)
      syncEditBuffer(server)
    notify('warning', 'Local Edit Buffer kept. Review it, then Save again.', 4000);
  }

  function applyServerConflict(server: FileRecord) {
    if (!isDirtyAgainst(file)) {
      removeEditBuffer(file.id)
      conflict = null
      file = server
      onUpdate?.(server)
      setCurrentFile(server)
      notify('info', 'Loaded the newer server File.', 3000)
      return false
    }

    conflict = {
      path: server.path,
      content: server.content ?? null,
      private: server.private,
      revision: server.revision,
    }
    setEditBuffer({
      fileId: file.id,
      path: pathValue,
      content: textareaValue,
      private: privateValue,
      baseRevision: baseRevisionValue,
      dirty: true,
      conflict: { server: conflict },
    })
    upsertItem(server)
    file = server
    onUpdate?.(server)
    return true
  }

  async function togglePrivate(e: Event) {
    e.preventDefault()
    if (trashed) return
    const previousPrivateValue = privateValue
    const newPrivateValue = !privateValue
    privateValue = newPrivateValue

    if (file.id > 0) {
      const formData = new FormData()
      formData.append('id', file.id.toString())
      formData.append('private', newPrivateValue.toString())
      formData.append('baseRevision', baseRevisionValue.toString())
      
      const result = await actions.form.setPrivate(formData)
      
      if (result.error) {
        const server = sourceConflictFromActionError(result.error)
        if (server) {
          const keptLocal = applyServerConflict(server)
          if (keptLocal)
            notify('warning', 'The server File changed. Your local Edit Buffer was kept.')
        }
        else {
          privateValue = previousPrivateValue
          notify('error', formatFileSaveError(result.error))
        }
      } else {
        if (result.data) {
          const updated = result.data
          baseRevisionValue = updated.revision;
          conflict = null
          upsertItem(updated)
          file = updated
          onUpdate?.(updated)
          setCurrentFile(updated)
          syncEditBuffer(updated)
        }
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

    const result = await actions.form.save(formData)

    if (result.error) {
      const server = sourceConflictFromActionError(result.error)
      if (server) {
        const keptLocal = applyServerConflict(server)
        if (keptLocal)
          notify('warning', 'The server File changed. Your local Edit Buffer was kept.')
      }
      else {
        notify('error', formatFileSaveError(result.error))
      }
    } else {
      notify('success', 'Saved Success', 3000)
      if (result.data) {
        file = result.data
        baseRevisionValue = file.revision;
        conflict = null
        removeEditBuffer(file.id)
        onSave?.(file)
        upsertItem(file)
      }
    }
  }
</script>

<div class="w-full flex-1 flex flex-col pt-5">
  <form method="POST" class="flex-1 flex flex-col h-full overflow-hidden">
    <EditorToolbar
      {file}
      bind:pathValue
      {privateValue}
      {changed}
      {conflict}
      {showPreview}
      {copyBtnText}
      {trashed}
      onBackToDashboard={backToDashboard}
      onBack={back}
      onTogglePrivate={togglePrivate}
      onSave={save}
      onUpload={upload}
      onPreview={preview}
      onCopyLink={copyLink}
      {onUpdate}
      {onPurge}
    />
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
