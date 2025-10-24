<script lang="ts">
import { actions } from "astro:actions";
import { Trash } from '@lucide/svelte'

interface Props {
  key: string
}

const { key }: Props = $props()

async function del() {
  await actions.oss.remove([{ key }])
  window.location.reload()
}
</script>

<button class="icon" onclick={del}><Trash /></button>
