<script lang="ts">
  import { getSourceFromPath } from '@/db'
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
  import { createMarkdownViewState } from './markdown-view-state.svelte';
  import { SvelteBuildController } from './svelte/build-controller.svelte';
  import DependencyDriftDialog from './svelte/DependencyDriftDialog.svelte';
  import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain';
  import type { SvelteBuildSuccess } from '@/lib/svelte/contracts';
  import type { DependencyDiff } from '@/lib/svelte/dependency-diff';
  import type { DeploymentSummary } from '@/lib/svelte/deployment-status';
  import { formatFileSaveError, sourceConflictFromActionError, uploadEditorImage } from './utils';
  import type { TextEditorHandle } from './TextEditor.svelte';
  import { toFileReferenceCandidates } from './text-editor/file-reference-completion';
  import { editBuffers, editBufferServerValues, isEditBufferDirty, setEditBuffer, removeEditBuffer, type EditBufferServerValues } from './edit-buffer.svelte';
  import { editorStore, upsertItem, notify } from './store.svelte';
  interface Props {
			file: FileRecord;
	    onSave?: (file: FileRecord) => void;
	    onUpdate?: (file: FileRecord) => void;
	    onPurge?: (id: number) => void;
	    onBack?: () => void;
			}
  let { file, onSave, onUpdate, onPurge, onBack }: Props = $props()
  const initialBuffer = editBuffers.get(file.id)
  let rendererValue = $state(initialBuffer?.renderer ?? file.renderer)
  let sourceValue = $state(initialBuffer?.content ?? file.content ?? '')
  let privateValue = $state(initialBuffer?.private ?? file.private ?? false)
  let previewHtml = $state('')
  let pathValue = $state(initialBuffer?.path ?? file.path ?? '')
  let localValuesFileId = $state(file.id)
  let baseRevisionValue = $state(initialBuffer?.baseRevision ?? file.revision)
  let conflict = $state<EditBufferServerValues | null>(initialBuffer?.conflict?.server ?? null)
  let titleValue = $derived(pathValue.split('/').filter(Boolean).at(-1) ?? '')
  let source = $derived(getSourceFromPath(pathValue))
  let displayTitleValue = $derived(getDisplayTitle({ source, title: titleValue, content: sourceValue }))
  let trashed = $derived(Boolean(file.deletedAt))
  let changed = $derived(!trashed && Boolean(editBuffers.get(file.id)?.dirty))
  let referenceCandidates = $derived(toFileReferenceCandidates(editorStore.items))
  let editorContent: TextEditorHandle | undefined = $state()
  let showPreview = $state(false)
  let previewFileId = $state<number | null>(null)

  export function focus() {
    editorContent?.focus()
  }

  const editorContentValues = $derived.by(() => {
    if (localValuesFileId === file.id) {
      return {
        path: pathValue,
        renderer: rendererValue,
        source: sourceValue,
      }
    }

    const buffer = editBuffers.get(file.id)
    return {
      path: buffer?.path ?? file.path,
      renderer: buffer?.renderer ?? file.renderer,
      source: buffer?.content ?? file.content ?? '',
    }
  })
  const editorContentTitle = $derived(editorContentValues.path.split('/').filter(Boolean).at(-1) ?? '')
  const svelteBuildController = new SvelteBuildController()
  const markdownViewState = createMarkdownViewState()
  const markdownPreviewActive = $derived(rendererValue === RENDERER_MODE.Markdown && markdownViewState.requestedMode === 'preview')

  function initialDeploymentSummary(current: Pick<FileRecord, 'renderer'>): DeploymentSummary {
    return {
      status: current.renderer === RENDERER_MODE.Svelte ? 'not_deployed' : 'not_applicable',
      deployedSourceHash: null,
      artifactHash: null,
    }
  }

  let deploymentSummary = $state<DeploymentSummary>(initialDeploymentSummary(file))
  let deploymentSummaryRequest = 0

  async function refreshDeploymentSummary(current: FileRecord) {
    const request = ++deploymentSummaryRequest
    if (current.deletedAt || current.renderer !== RENDERER_MODE.Svelte) {
      deploymentSummary = initialDeploymentSummary(current)
      return
    }
    const result = await actions.db.renderArtifact.status({ fileId: current.id })
    if (request !== deploymentSummaryRequest || current.id !== file.id || current.sourceHash !== file.sourceHash)
      return
    deploymentSummary = result.data ?? initialDeploymentSummary(current)
  }
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
    if (previewFileId !== null && previewFileId !== data.id) {
      showPreview = false
      previewFileId = null
    }
    rendererValue = buffer?.renderer ?? data.renderer;
    sourceValue = buffer?.content ?? data.content ?? '';
    privateValue = buffer?.private ?? data.private ?? false;
    pathValue = buffer?.path ?? data.path ?? '';
    localValuesFileId = data.id;
    baseRevisionValue = buffer?.baseRevision ?? data.revision;
    conflict = buffer?.conflict?.server ?? null;
  });

  $effect(() => {
    void refreshDeploymentSummary(file)
  })

  $effect(() => {
    const sourceForPreview = sourceValue
    const titleForPreview = displayTitleValue
    const rendererForPreview = rendererValue
    const timer = window.setTimeout(() => {
      if (sourceForPreview === sourceValue && titleForPreview === displayTitleValue && rendererForPreview === rendererValue)
        void refreshPreview()
    }, 150)
    return () => window.clearTimeout(timer)
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

  const toolbarPreviewActive = $derived(showPreview || markdownPreviewActive)
  let previewBuildKey = ''
  let previewBuildActive = false
  let svelteArtifact = $derived(svelteBuildController.build?.type === 'build-success'
    ? { css: svelteBuildController.build.css, javascript: svelteBuildController.build.javascript }
    : null)
  let svelteBuildError = $derived(svelteBuildController.build?.type === 'build-error'
    ? svelteBuildController.build.error.message
    : null)
  let pendingBuild = $state<SvelteBuildSuccess | null>(null)
  let pendingBuildFile = $state<FileRecord | null>(null)
  let pendingDependencyReview = $state<{ currentArtifactHash: string, proposedArtifactHash: string, diff: DependencyDiff } | null>(null)
  let deploying = $state(false)
  let deploymentFailed = $state(false)
  let saving = $state(false)
  let savedAcknowledgement = $state(false)
  let savedAcknowledgementTimer: ReturnType<typeof window.setTimeout> | undefined
  let activeDeployments = 0
  let deployGeneration = 0

  function startDeployment() {
    activeDeployments += 1
    deploying = true
  }

  function finishDeployment() {
    activeDeployments = Math.max(0, activeDeployments - 1)
    deploying = activeDeployments > 0
  }

  function clearPendingDeploymentReview() {
    pendingBuild = null
    pendingBuildFile = null
    pendingDependencyReview = null
  }

  function acknowledgeSave() {
    savedAcknowledgement = true
    if (savedAcknowledgementTimer)
      window.clearTimeout(savedAcknowledgementTimer)
    savedAcknowledgementTimer = window.setTimeout(() => {
      savedAcknowledgement = false
      savedAcknowledgementTimer = undefined
    }, 1200)
  }

  $effect(() => {
    if (changed)
      savedAcknowledgement = false
  })

  onMount(() => () => {
    if (savedAcknowledgementTimer)
      window.clearTimeout(savedAcknowledgementTimer)
  })

  async function currentSavedBuild(savedFile: FileRecord) {
    const buffer = {
      enabled: true,
      fileId: savedFile.id,
      renderer: savedFile.renderer,
      source: savedFile.content,
      sourceHash: savedFile.sourceHash,
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
      const detail = JSON.parse(error.message) as { code?: string, currentArtifactHash?: string, proposedArtifactHash?: string, diff?: DependencyDiff }
      return detail.code === 'dependency_changed'
        && detail.currentArtifactHash && detail.proposedArtifactHash
        ? detail
        : undefined
    }
    catch {
      return undefined
    }
  }

  async function attachSavedBuild(savedFile: FileRecord, build: SvelteBuildSuccess, confirmation?: { currentArtifactHash: string, proposedArtifactHash: string }) {
    const artifact = { css: build.css, javascript: build.javascript }
    const snapshotHtml = await editorContent?.snapshotSvelteArtifact(artifact)
    if (!snapshotHtml)
      throw new Error('Svelte Preview did not produce an Artifact Snapshot')
    return actions.db.renderArtifact.attach({
      fileId: savedFile.id,
      schemaVersion: 1,
      renderer: 'svelte',
      svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
      unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
      unocssConfigHash: UNOCSS_CONFIG_HASH,
      sourceHash: savedFile.sourceHash,
      dependencies: build.dependencies,
      javascript: build.javascript,
      css: build.css,
      snapshotHtml,
      ...(confirmation ? { confirmation } : {}),
    })
  }

  async function deploySavedSvelteFile(savedFile: FileRecord) {
    const generation = ++deployGeneration
    deploymentFailed = false
    startDeployment()
    try {
      const build = await currentSavedBuild(savedFile)
      if (generation !== deployGeneration)
        return

      const result = await attachSavedBuild(savedFile, build)
      if (generation !== deployGeneration)
        return
      if (!result.error && result.data) {
        deploymentSummary = {
          status: 'deployed',
          deployedSourceHash: savedFile.sourceHash,
          artifactHash: result.data.artifactHash,
        }
        notify('success', 'Svelte File deployed to the site.', 3000)
        return
      }
      const review = result.error ? dependencyReview(result.error) : undefined
      if (!review) {
        deploymentFailed = true
        notify('error', `Deployment failed: ${result.error ? formatFileSaveError(result.error) : 'Artifact attachment returned no result'}`)
        return
      }
      pendingBuild = build
      pendingBuildFile = savedFile
      pendingDependencyReview = review as { currentArtifactHash: string, proposedArtifactHash: string, diff: DependencyDiff }
      notify('warning', 'Review dependency changes before deploying.', 5000)
    }
    catch (error) {
      if (generation !== deployGeneration)
        return
      deploymentFailed = true
      const message = error instanceof Error ? error.message : 'Svelte Artifact deployment failed'
      notify('error', `Deployment failed: ${message}`)
    }
    finally {
      finishDeployment()
    }
  }

  async function deploy(e: Event) {
    e.preventDefault()
    if (trashed || rendererValue !== RENDERER_MODE.Svelte || deploying)
      return
    if (changed) {
      notify('warning', 'Save Source before deploying it.', 4000)
      return
    }
    await deploySavedSvelteFile(file)
  }

  async function approveDependencyReplacement() {
    const build = pendingBuild
    const savedFile = pendingBuildFile
    const review = pendingDependencyReview
    clearPendingDeploymentReview()
    if (!build || !savedFile || !review)
      return
    startDeployment()
    try {
      const confirmed = await attachSavedBuild(savedFile, build, review)
      if (confirmed.error || !confirmed.data) {
        deploymentFailed = true
        notify('error', `Deployment failed: ${confirmed.error ? formatFileSaveError(confirmed.error) : 'Artifact attachment returned no result'}`)
      }
      else {
        deploymentFailed = false
        deploymentSummary = {
          status: 'deployed',
          deployedSourceHash: savedFile.sourceHash,
          artifactHash: confirmed.data.artifactHash,
        }
        notify('success', 'Svelte File deployed after dependency review.', 3000)
      }
    }
    catch (error) {
      deploymentFailed = true
      notify('error', error instanceof Error ? error.message : 'Dependency confirmation failed')
    }
    finally {
      finishDeployment()
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
      if (previewBuildActive)
        svelteBuildController.previewClosed()
      previewBuildActive = false
      return
    }
    previewBuildActive = true
    if (nextKey === previewBuildKey)
      return
    const openingPreview = previewBuildKey === ''
    previewBuildKey = nextKey
    if (openingPreview)
      void svelteBuildController.previewOpened(previewBuffer)
    else
      svelteBuildController.previewChanged(previewBuffer)
  })

  async function closePreview() {
    if (rendererValue === RENDERER_MODE.Markdown && markdownViewState.requestedMode === 'preview') {
      markdownViewState.setRequestedMode('source')
      await tick()
      editorContent?.focus()
      return
    }
    if (!showPreview)
      return
    showPreview = false
    previewFileId = null
    await tick()
    editorContent?.focus()
  }

  async function preview(e: Event) {
    e.preventDefault()
    if (rendererValue === RENDERER_MODE.Markdown) {
      markdownViewState.setRequestedMode(markdownViewState.requestedMode === 'preview' ? 'source' : 'preview')
      return
    }
    if (showPreview) {
      await closePreview()
      return
    }
    showPreview = true
    previewFileId = file.id
    await tick()
    editorContent?.focusPreview()
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

  function copyFileReference() {
    if (!navigator.clipboard)
      return
    navigator.clipboard.writeText(`[[${pathValue}]]`).then(() => {
      notify('success', 'Copied File Reference', 2000)
    }).catch(() => {
      notify('error', 'Could not copy File Reference')
    })
  }

  function backToDashboard(e: Event) {
    e.preventDefault()

    window.location.href = '/dashboard'
  }

  function useServerVersion() {
    if (!conflict || !window.confirm('Replace the local Edit Buffer with the current server File?')) return;
    const server = editorStore.items.find(item => item.id === file.id)
    if (!server) return;
    removeEditBuffer(file.id);
    conflict = null;
    file = server;
    onUpdate?.(server);
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
          syncEditBuffer(updated)
        }
      }
    }
  }

  async function save(e: Event) {
    e.preventDefault()
    if (trashed || saving || !changed) return
    if (conflict) {
      notify('warning', 'Resolve the Source conflict before saving again.', 4000);
      return;
    }

    const savedFromFileId = file.id
    const formData = new FormData()
    formData.append('id', file.id.toString())
    formData.append('path', pathValue)
    formData.append('renderer', rendererValue)
    formData.append('content', sourceValue)
    formData.append('private', String(privateValue));
    formData.append('baseRevision', baseRevisionValue.toString())

    saving = true
    try {
      const result = await actions.form.save(formData)

      if (result.error) {
        handleFileMutationError(result.error)
      } else if (result.data) {
        const savedFile = result.data
        file = savedFile
        baseRevisionValue = file.revision;
        conflict = null
        removeEditBuffer(savedFromFileId)
        onSave?.(file)
        upsertItem(file)
        clearPendingDeploymentReview()
        deploymentFailed = false
        deploymentSummary = initialDeploymentSummary(savedFile)
        void refreshDeploymentSummary(savedFile)
        acknowledgeSave()
        notify('success', 'Source saved.', 3000)
      } else {
        acknowledgeSave()
      notify('success', 'Source saved.', 3000)
      }
    } finally {
      saving = false
    }
  }
</script>

<div class="editor-file-workspace">
  <form method="POST" class="editor-file-form">
    {#if !showPreview}
      <EditorToolbar
        {file}
        {pathValue}
        {rendererValue}
        {privateValue}
        {changed}
        {saving}
        {savedAcknowledgement}
        {conflict}
        showPreview={toolbarPreviewActive}
        {copyBtnText}
        {trashed}
        {deploying}
        {deploymentSummary}
        {deploymentFailed}
        markdownViewMode={markdownViewState.requestedMode}
        onBackToDashboard={backToDashboard}
        onBack={() => onBack?.()}
        onTogglePrivate={togglePrivate}
        onRendererChange={changeRenderer}
        onSave={save}
        onUpload={upload}
        onPreview={preview}
        onDeploy={deploy}
        onCopyLink={copyLink}
        onCopyReference={copyFileReference}
        onPathChange={(path) => { pathValue = path }}
        onMarkdownViewChange={(mode) => markdownViewState.setRequestedMode(mode)}
        {onUpdate}
        {onPurge}
      />
    {/if}
    <EditorContent
      bind:this={editorContent}
      title={editorContentTitle}
      fileId={file.id}
      filePath={editorContentValues.path}
      renderer={editorContentValues.renderer}
      diagnostics={svelteBuildController.diagnostics}
      value={editorContentValues.source}
      {referenceCandidates}
      {showPreview}
      markdownRequestedMode={markdownViewState.requestedMode}
      markdownSplitRatio={markdownViewState.splitRatio}
      {previewHtml}
      {svelteArtifact}
      {svelteBuildError}
      {trashed}
      {changed}
      {privateValue}
      {conflict}
      {deploymentSummary}
      {deploying}
      baseRevision={baseRevisionValue}
      onUseServer={useServerVersion}
      onRebase={retryLocalAgainstCurrentRevision}
      onClosePreview={closePreview}
      onMarkdownSplitRatio={(ratio, contentWidth) => markdownViewState.setSplitRatio(ratio, contentWidth)}
      onChange={(value) => { sourceValue = value; }}
      {uploadImage}
    />
  </form>
</div>

{#if pendingDependencyReview}
  <DependencyDriftDialog
    {...pendingDependencyReview}
    onApprove={approveDependencyReplacement}
    onCancel={() => {
      pendingBuild = null
      pendingDependencyReview = null
      notify('info', 'Dependency change was not approved.', 3000)
    }}
  />
{/if}
