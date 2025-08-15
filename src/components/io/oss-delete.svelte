<script lang="ts">
import { actions } from "astro:actions";

interface Props {
  key: string
}

const { key }: Props = $props()

async function del() {
  await actions.oss.remove([{ key }])
  window.location.reload()
}
</script>

<button onclick={del}>Delete</button>
