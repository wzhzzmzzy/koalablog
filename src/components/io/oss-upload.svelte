<script lang="ts">
import { pickFileWithFileInput, uploadFile } from "@/lib/services/file-reader";
import type { ActionError } from "astro:actions";

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
<button class="w-20" disabled={uploading} onclick={upload}>{uploading ? 'Uploading' : 'Upload'}</button>
