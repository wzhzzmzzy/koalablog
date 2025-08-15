<script lang="ts">
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


<button disabled={copied} onclick={copy}>{copied ? 'Copied' : text}</button>
