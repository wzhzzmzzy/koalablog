<script lang="ts">
import { Check, Copy } from '@lucide/svelte'
import { Button } from '@/components/ui/button'

interface Props {
  text: string;
  content: string;
}

const { text, content }: Props = $props()

function execCopyCommand(value: string) {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.style.position = 'fixed';
  textarea.style.clip = 'rect(0 0 0 0)';
  textarea.style.top = '0';
  textarea.value = value;
  textarea.select();
  document.execCommand('copy', true);
  document.body.removeChild(textarea);
}


let copied = $state(false)

async function copy() {
  try {
    await navigator!.clipboard.writeText(content)
  } catch (e) {
    execCopyCommand(content)
  }

  copied = true
  setTimeout(() => {
    copied = false
  }, 1500)
}

</script>


<Button
  variant="outline"
  size="icon-sm"
  disabled={copied}
  onclick={copy}
  aria-label={`Copy ${text}`}
  title={`Copy ${text}`}
>
  {#if copied}
    <Check />
  {:else}
    <Copy />
  {/if}
</Button>
