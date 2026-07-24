<script lang="ts">
  import { getSourceFromPath, getMarkdownSourceKey } from '@/db'
  import type { FileRecord } from '@/db/types';
  import { onMount, tick } from 'svelte';
  import { md } from '@/lib/markdown';
  import { getDisplayTitle } from '@/lib/files/display-title';
  import { RENDERER_MODE, type RendererMode } from '@/lib/files/types';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput } from '@/lib/services/file-reader';
  import EditorContent from './EditorContent.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import { SvelteBuildController } from './svelte/build-controller.svelte';
  import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain';
  import type { SvelteBuildSuccess } from '@/lib/svelte/contracts';
  import { findPreviousActiveFile, formatFileSaveError, sourceConflictFromActionError, uploadEditorImage } from './utils';
  import type { TextEditorHandle } from './TextEditor.svelte';
  import { editBuffers, editBufferServerValues, isEditBufferDirty, setEditBuffer, removeEditBuffer, type EditBufferServerValues } from './edit-buffer.svelte';
  import { editorStore, upsertItem, popHistory, setCurrentFile, notify } from './store.svelte';
  interface Props {
			file: FileRecord;
	    onSave?: (file: FileRecord) => void;
	    onUpdate?: (file: FileRecord) => void;
	    onPurge?: (id: number) => void;
			}
  let { file, onSave, onUpdate, onPurge }: Props = $props()
  const initialBuffer = editBuffers.get(file.id)
  let rendererValue = $state(initialBuffer?.renderer ?? file.renderer)
  let sourceValue = $state(initialBuffer?.content ?? file.content ?? '')
  let privateValue = $state(initialBuffer?.private ?? file.private ?? false)
  let previewHtml = $state('')
  let pathValue = $state(initialBuffer?.path ?? file.path ?? '')
  let baseRevisionValue = $state(initialBuffer?.baseRevision ?? file.revision)
  let conflict = $state<EditBufferServerValues | null>(initialBuffer?.conflict?.server ?? null)
  let titleValue = $derived(pathValue.split('/').filter(Boolean).at(-1) ?? '')
  let source = $derived(getSourceFromPath(pathValue))
  let displayTitleValue = $derived(getDisplayTitle({ source, title: titleValue, content: sourceValue }))
  let trashed = $derived(Boolean(file.deletedAt))
  let changed = $derived(!trashed && Boolean(editBuffers.get(file.id)?.dirty))
  let editorContent: TextEditorHandle | undefined = $state()
  const svelteBuildController = new SvelteBuildController()

  function isDirtyAgainst(server: FileRecord) {
    return isEditBufferDirty({
      path: pathValue,
      renderer: rendererValue,
      content: sourceValue,
      private: privateValue,
    }, server)
  }

  function syncEditBuffer(server: FileRecord) {
    const dirty = isDirtyAgainst(server)
    if (dirty || conflict) {
      setEditBuffer({
        fileId: server.id,
        path: pathValue,
        renderer: rendererValue,
        content: sourceValue,
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
    rendererValue = buffer?.renderer ?? data.renderer;
    sourceValue = buffer?.content ?? data.content ?? '';
    privateValue = buffer?.private ?? data.private ?? false;
    pathValue = buffer?.path ?? data.path ?? '';
    baseRevisionValue = buffer?.baseRevision ?? data.revision;
    conflict = buffer?.conflict?.server ?? null;
  });

  $effect(() => {
     refreshPreview()
  })

  $effect(() => {
    svelteBuildController.diagnose({
      fileId: file.id,
      renderer: rendererValue,
      source: sourceValue,
      enabled: !trashed,
    })
  })

  $effect(() => {
    document.title = `[Editor] ${displayTitleValue || 'New File'}`
  })

  let mdInstance: MarkdownIt | null = null
  onMount(async () => {
    mdInstance = await md({ allFilePaths: editorStore.items.filter(item => !item.deletedAt).map(item => item.path) })
    refreshPreview()
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (!trashed && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save(e)
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  })

  onMount(() => () => svelteBuildController.dispose())

  $effect(() => {
      if (mdInstance && editorStore.items.length > 0) {
          md({ allFilePaths: editorStore.items.filter(item => !item.deletedAt).map(item => item.path) }).then(inst => {
              mdInstance = inst;
              refreshPreview();
          });
      }
  });

  async function refreshPreview() {
    let previewMd = sourceValue
    if (displayTitleValue) {
      previewMd = `# ${displayTitleValue}\n\n${sourceValue}`
    }
    if (mdInstance) {
      previewHtml = mdInstance.render(previewMd)
      setTimeout(() => {
        window.refreshCopyListener();
        window.refreshTagListener();
      }, 100)
    }
  }

  async function uploadImage(file: File) {
    try {
      const result = await uploadEditorImage(file)
      notify('success', 'Uploaded Successfully', 3000)
      return result
    }
    catch (error) {
      notify('error', error instanceof Error ? error.message : 'Upload failed')
      throw error
    }
  }

  async function upload(e: Event) {
    e.preventDefault()
    const files = await pickFileWithFileInput('image/*', true)
    if (files.length > 0) {
      await editorContent?.insertImages(Array.from(files))
      editorContent?.focus()
    }
  }

  let showPreview = $state(false)
  let previewBuildKey = ''
  let svelteArtifact = $derived(svelteBuildController.build?.type === 'build-success'
    ? { css: svelteBuildController.build.css, javascript: svelteBuildController.build.javascript }
    : null)
  let svelteBuildError = $derived(svelteBuildController.build?.type === 'build-error'
    ? svelteBuildController.build.error.message
    : null)

  async function currentSavedBuild() {
    const buffer = {
      enabled: true,
      fileId: file.id,
      renderer: file.renderer,
      source: file.content,
      sourceHash: file.sourceHash,
    }
    await svelteBuildController.saved(buffer)
    for (let attempt = 0; attempt < 200; attempt++) {
      const build = svelteBuildController.build
      if (build?.type === 'build-success')
        return build
      if (build?.type === 'build-error')
        throw new Error(build.error.message)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Svelte Artifact build timed out')
  }

  function dependencyReview(error: { message: string }) {
    try {
      const detail = JSON.parse(error.message) as { code?: string, currentArtifactHash?: string, proposedArtifactHash?: string, diff?: unknown }
      return detail.code === 'dependency_changed'
        && detail.currentArtifactHash && detail.proposedArtifactHash
        ? detail
        : undefined
    }
    catch {
      return undefined
    }
  }

  async function attachSavedBuild(build: SvelteBuildSuccess, confirmation?: { currentArtifactHash: string, proposedArtifactHash: string }) {
    const artifact = { css: build.css, javascript: build.javascript }
    const snapshotHtml = await editorContent?.snapshotSvelteArtifact(artifact)
    if (!snapshotHtml)
      throw new Error('Svelte Preview did not produce an Artifact Snapshot')
    return actions.db.renderArtifact.attach({
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
      ...(confirmation ? { confirmation } : {}),
    })
  }

  async function rebuild(e: Event) {
    e.preventDefault()
    if (trashed || rendererValue !== RENDERER_MODE.Svelte)
      return
    if (changed) {
      notify('warning', 'Save Source before rebuilding its Artifact.', 4000)
      return
    }
    try {
      showPreview = true
      await tick()
      const build = await currentSavedBuild()
      const result = await attachSavedBuild(build)
      if (!result.error) {
        notify('success', 'Svelte Artifact rebuilt.', 3000)
        return
      }
      const review = dependencyReview(result.error)
      if (!review) {
        notify('error', formatFileSaveError(result.error))
        return
      }
      if (!window.confirm(`Dependency changes detected. Review and approve replacement?\n${JSON.stringify(review.diff, null, 2)}`)) {
        notify('info', 'Dependency change was not approved.', 3000)
        return
      }
      const confirmed = await attachSavedBuild(build, {
        currentArtifactHash: review.currentArtifactHash,
        proposedArtifactHash: review.proposedArtifactHash,
      })
      if (confirmed.error)
        notify('error', formatFileSaveError(confirmed.error))
      else
        notify('success', 'Svelte Artifact rebuilt after dependency review.', 3000)
    }
    catch (error) {
      notify('error', error instanceof Error ? error.message : 'Svelte Artifact rebuild failed')
    }
  }

  $effect(() => {
    const previewBuffer = {
      enabled: !trashed,
      fileId: file.id,
      renderer: rendererValue,
      source: sourceValue,
    }
    const nextKey = `${previewBuffer.fileId}\u0000${previewBuffer.renderer}\u0000${previewBuffer.source}`
    if (!showPreview || previewBuffer.renderer !== RENDERER_MODE.Svelte || !previewBuffer.enabled) {
      previewBuildKey = ''
      svelteBuildController.previewClosed()
      return
    }
    if (nextKey === previewBuildKey)
      return
    const openingPreview = previewBuildKey === ''
    previewBuildKey = nextKey
    if (openingPreview)
      void svelteBuildController.previewOpened(previewBuffer)
    else
      svelteBuildController.previewChanged(previewBuffer)
  })

  async function preview(e: Event) {
    e.preventDefault()
    const returningToEdit = showPreview
    showPreview = !showPreview
    if (returningToEdit) {
      await tick()
      editorContent?.focus()
    }
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

  function changeRenderer(renderer: RendererMode) {
    if (!trashed)
      rendererValue = renderer;
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

    conflict = editBufferServerValues(server)
    setEditBuffer({
      fileId: file.id,
      path: pathValue,
      renderer: rendererValue,
      content: sourceValue,
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

  function handleFileMutationError(error: { code?: string, message: string }, rollback?: () => void) {
    const server = sourceConflictFromActionError(error)
    if (server) {
      const keptLocal = applyServerConflict(server)
      if (keptLocal)
        notify('warning', 'The server File changed. Your local Edit Buffer was kept.')
      return
    }
    rollback?.()
    notify('error', formatFileSaveError(error))
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
        handleFileMutationError(result.error, () => {
          privateValue = previousPrivateValue
        })
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
    formData.append('renderer', rendererValue)
    formData.append('content', sourceValue)
    formData.append('private', String(privateValue));
    formData.append('baseRevision', baseRevisionValue.toString())

    const result = await actions.form.save(formData)

    if (result.error) {
      handleFileMutationError(result.error)
    } else {
      notify('success', 'Saved Success', 3000)
      if (result.data) {
        file = result.data
        baseRevisionValue = file.revision;
        conflict = null
        removeEditBuffer(file.id)
        onSave?.(file)
        upsertItem(file)
        if (file.renderer === RENDERER_MODE.Svelte) {
          void svelteBuildController.saved({
            enabled: true,
            fileId: file.id,
            renderer: file.renderer,
            source: file.content,
            sourceHash: file.sourceHash,
          })
        }
      }
    }
  }
</script>

<div class="w-full flex-1 min-h-0 flex flex-col pt-5">
  <form method="POST" class="flex-1 flex flex-col h-full overflow-hidden">
    <EditorToolbar
      {file}
      bind:pathValue
      {rendererValue}
      {privateValue}
      {changed}
      {conflict}
      {showPreview}
      {copyBtnText}
      {trashed}
      onBackToDashboard={backToDashboard}
      onBack={back}
      onTogglePrivate={togglePrivate}
      onRendererChange={changeRenderer}
      onSave={save}
      onUpload={upload}
      onPreview={preview}
      onRebuild={rebuild}
      onCopyLink={copyLink}
      {onUpdate}
      {onPurge}
    />
    <EditorContent
      bind:this={editorContent}
      title={titleValue}
      fileId={file.id}
      filePath={pathValue}
      renderer={rendererValue}
      diagnostics={svelteBuildController.diagnostics}
      value={sourceValue}
      {showPreview}
      {previewHtml}
      {svelteArtifact}
      {svelteBuildError}
      {trashed}
      {conflict}
      baseRevision={baseRevisionValue}
      onUseServer={useServerVersion}
      onRebase={retryLocalAgainstCurrentRevision}
      onChange={(value) => { sourceValue = value; }}
      {uploadImage}
    />
  </form>
</div>
