<script lang="ts">
import { pickFileWithFileInput, uploadFile } from "@/lib/services/file-reader";
import type { ActionError } from "astro:actions";
import { FileUp, Loader } from "@lucide/svelte";
import { Button } from '@/components/ui/button';

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
  <p class="text-sm text-destructive" role="alert">{error.message}</p>
{/if}
<Button variant="outline" size="sm" disabled={uploading} onclick={upload}>
  {#if uploading}
    <Loader class="animate-spin" />
    Uploading
  {:else}
    <FileUp />
    Upload file
  {/if}
</Button>
