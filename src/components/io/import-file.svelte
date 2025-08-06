<script lang="ts">
import { supportFSApi } from "@/lib/services/file-reader";
import { importFromFilePicker } from "@/lib/services/io";
import { onMount } from "svelte";

let supportFilePicker = $state(true)

onMount(() => {
  supportFilePicker = supportFSApi()
})

const onImport = async () => {
  await importFromFilePicker()
}
</script>

<div>
  <span>
    Import:
  </span>
  <input type="file" id="fileInput">
  <button 
    id="import-from" 
    class="border-0 !w-60 !h-20 bg-teal-200 rounded-sm mt-2 flex items-center justify-center"
    disabled={!supportFilePicker}
    onclick={onImport}
  >
    Import file
  </button>
</div>
