<script lang="ts">
import { pickFileWithFileInput, uploadFile } from "@/lib/services/file-reader";
import type { ActionError } from "astro:actions";
import { FileUp, Loader } from "@lucide/svelte";

interface Props {
  source: 'article' | 'oss'
}

const { source }: Props = $props()

let uploading = $state(false)
let error = $state<ActionError<{ source: Props['source'], file: File }> | undefined>()
async function upload() {
  const files = await pickFileWithFileInput()
  uploading = true
  const { error: uploadError } = await uploadFile(source, files)
  if (uploadError) error = uploadError
  else window.location.reload()
  uploading = false
}
</script>

{#if error}
  <p class="error">{error.message}</p>
{/if}
<button class="icon" disabled={uploading} onclick={upload}>
  {#if uploading}
    <Loader />
  {:else}
    <FileUp />
  {/if}
</button>
