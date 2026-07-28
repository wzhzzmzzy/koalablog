<script lang="ts">
import { exportAllFiles } from "@/lib/services/io";
import { Button } from '@/components/ui/button'
</script>

<div class="flex flex-wrap items-center justify-between gap-4 border-b border-border py-4">
  <div>
    <p class="text-sm font-medium text-foreground">Export workspace</p>
    <p class="mt-1 text-sm text-muted-foreground">Download all source Files as a portable ZIP archive.</p>
  </div>
  <Button variant="outline" id="export-all" onclick={exportAllFiles}>Download Zip</Button>
</div>
