<script lang="ts">
  import type { FileRecord } from '@/db/types'
  import { FileText } from '@lucide/svelte'
  import { fileReferencePeekExcerpt } from './file-reference-peek'

  export interface FileReferencePeekTarget {
    file: FileRecord
    content: string
    dirty: boolean
  }

  interface Props {
    target: FileReferencePeekTarget
    left: number
    top: number
  }

  let { target, left, top }: Props = $props()
  const title = $derived(target.file.path.split('/').filter(Boolean).at(-1) ?? 'Untitled')
  const excerpt = $derived(fileReferencePeekExcerpt(target.content))
</script>

<aside
  id="editor-file-reference-peek"
  class="editor-file-reference-peek"
  role="tooltip"
  aria-label={`Peek ${target.file.path}`}
  data-testid="file-reference-peek"
  style={`left:${left}px;top:${top}px;`}
>
  <div class="editor-file-reference-peek__heading">
    <FileText size={15} aria-hidden="true" />
    <strong>{title}</strong>
    {#if target.dirty}<span>Unsaved</span>{/if}
  </div>
  <code>{target.file.path}</code>
  <p>{excerpt}</p>
</aside>
