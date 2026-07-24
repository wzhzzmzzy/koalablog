<script lang="ts">
  import { onMount } from 'svelte'
  import {
    PreviewCommandSupersededError,
    SveltePreviewRpc,
    type PreviewArtifact,
    type PreviewRuntimeErrorMessage,
  } from './preview-protocol'
  import { createPreviewSrcdoc } from './preview-srcdoc'
  import { canonicalizeSnapshotHtml } from '@/lib/svelte/snapshot'

  interface Props {
    artifact?: PreviewArtifact | null
    onFocusReturn: () => void
    onPreviewError?: (error: Error | PreviewRuntimeErrorMessage) => void
    onReady?: () => void
  }

  let { artifact = null, onFocusReturn, onPreviewError = () => {}, onReady = () => {} }: Props = $props()
  let iframe: HTMLIFrameElement | undefined = $state()
  let srcdoc = $state('')
  let ready = $state(false)
  let rpc: SveltePreviewRpc | null = $state(null)

  function reportError(error: Error | PreviewRuntimeErrorMessage) {
    if (!(error instanceof PreviewCommandSupersededError))
      onPreviewError(error)
  }

  onMount(() => {
    rpc = new SveltePreviewRpc({
      onFocusReturn,
      onRuntimeError: reportError,
    })
    srcdoc = createPreviewSrcdoc(window.location.origin)
    iframeLoaded()
    return () => rpc?.dispose()
  })

  $effect(() => {
    if (!ready || !artifact || !rpc)
      return
    void rpc.render(artifact).catch(reportError)
  })

  function iframeLoaded() {
    if (!rpc || !iframe || !srcdoc)
      return
    const becameReady = !ready
    rpc.setTarget(iframe.contentWindow)
    ready = true
    if (becameReady)
      onReady()
  }

  export function focus() {
    iframe?.focus()
  }

  export function render(nextArtifact: PreviewArtifact) {
    if (!rpc)
      return Promise.reject(new Error('Svelte Preview iframe is not ready'))
    return rpc.render(nextArtifact)
  }

  export async function snapshot(nextArtifact: PreviewArtifact) {
    if (!rpc)
      throw new Error('Svelte Preview iframe is not ready')
    return canonicalizeSnapshotHtml(await rpc.snapshot(nextArtifact))
  }
</script>

<iframe
  bind:this={iframe}
  class="h-full min-h-0 w-full border-0 bg-[--koala-bg]"
  data-koala-svelte-preview
  sandbox="allow-scripts"
  {srcdoc}
  title="Svelte Preview"
  onload={iframeLoaded}
></iframe>
