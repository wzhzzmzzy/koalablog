<script lang="ts">
import { exportAllFiles } from "@/lib/services/io";
</script>

<div>
  <span>
    Export:
  </span>
  <button class="!w-32 !h-10 btn" id="export-all" onclick={exportAllFiles}>Download Zip</button>
</div>
