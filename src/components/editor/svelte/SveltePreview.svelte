<script lang="ts">
  import { onMount } from 'svelte'
  import {
    PreviewCommandSupersededError,
    InDocumentPreviewRuntime,
    type PreviewArtifact,
    type PreviewRuntimeErrorMessage,
  } from './preview-runtime'
  import { canonicalizeSnapshotHtml } from '@/lib/svelte/snapshot'

  interface Props {
    artifact?: PreviewArtifact | null
    onFocusReturn: () => void
    onPreviewError?: (error: Error | PreviewRuntimeErrorMessage) => void
    onReady?: () => void
  }

  let { artifact = null, onFocusReturn, onPreviewError = () => {}, onReady = () => {} }: Props = $props()
  let artifactRoot: HTMLDivElement | undefined = $state()
  let artifactStyle: HTMLStyleElement | undefined = $state()
  let ready = $state(false)
  let runtime: InDocumentPreviewRuntime | null = $state(null)

  function reportError(error: Error | PreviewRuntimeErrorMessage) {
    if (!(error instanceof PreviewCommandSupersededError))
      onPreviewError(error)
  }

  onMount(() => {
    if (!artifactRoot || !artifactStyle)
      throw new Error('Svelte Preview mount target is missing')
    runtime = new InDocumentPreviewRuntime({
      root: artifactRoot,
      style: artifactStyle,
      onFocusReturn,
      onRuntimeError: reportError,
    })
    previewReady()
    return () => { void runtime?.dispose() }
  })

  $effect(() => {
    if (!ready || !artifact || !runtime)
      return
    void runtime.render(artifact).catch(reportError)
  })

  function previewReady() {
    if (ready)
      return
    ready = true
    onReady()
  }

  export function focus() {
    runtime?.focus()
  }

  export function render(nextArtifact: PreviewArtifact) {
    if (!runtime)
      return Promise.reject(new Error('Svelte Preview is not ready'))
    return runtime.render(nextArtifact)
  }

  export async function snapshot(nextArtifact: PreviewArtifact) {
    if (!runtime)
      throw new Error('Svelte Preview is not ready')
    return canonicalizeSnapshotHtml(await runtime.snapshot(nextArtifact))
  }
</script>

<div class="h-full min-h-0 w-full bg-[--koala-bg]" data-koala-svelte-preview>
  <style bind:this={artifactStyle} data-koala-artifact></style>
  <div bind:this={artifactRoot} class="h-full min-h-0 w-full" data-koala-artifact-root tabindex="-1"></div>
</div>
