<script lang="ts">
import { exportAllPosts } from "@/lib/services/io";

const exportAll = () => {
  exportAllPosts()
}
</script>

<div>
  <span>
    Export:
  </span>
  <button class="!w-32 !h-10" id="export-all" onclick={exportAll}>Download Zip</button>
</div>
