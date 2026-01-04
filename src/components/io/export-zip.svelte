<script lang="ts">
import { exportAllPosts } from "@/lib/services/io";
</script>

<div>
  <span>
    Export:
  </span>
  <button class="!w-32 !h-10 btn" id="export-all" onclick={exportAllPosts}>Download Zip</button>
</div>
