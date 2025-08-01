<script lang="ts">
import { exportAllPosts } from "@/lib/services/io";

const exportAll = () => {
  console.log('export-all')
  exportAllPosts()
}
</script>

<div>
  <span>
    Export:
  </span>
  <button id="export-all" onclick={exportAll} >Download Zip</button>
</div>
