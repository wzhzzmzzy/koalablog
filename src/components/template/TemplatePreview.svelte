<script lang="ts">
  import type { TemplateCatalogPreview } from './template-manager-model'
  import { Badge } from '@/components/ui/badge'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'

  interface Props {
    preview: TemplateCatalogPreview
    targetPrefix: string
    onprefixchange: (value: string) => void
  }

  let { preview, targetPrefix, onprefixchange }: Props = $props()
  const invalidTargetPrefix = $derived(preview.status === 'invalid_target_prefix')
</script>

<aside class="col-span-1 min-w-0 border-t border-border bg-muted/35 p-5 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l" aria-labelledby="template-preview-title" aria-live="polite">
  <div class="flex items-center justify-between gap-3">
    <h2 id="template-preview-title" class="text-sm font-medium">Preview</h2>
    {#if preview.status === 'ready'}<Badge variant="outline">{preview.renderer === 'svelte' ? 'Svelte' : 'Markdown'}</Badge>{/if}
  </div>
  <div class="mt-5 grid gap-2">
    <Label for="preview-target-prefix">Target Path Prefix</Label>
    <Input
      id="preview-target-prefix"
      class="font-mono"
      value={targetPrefix}
      oninput={(event) => onprefixchange(event.currentTarget.value)}
      aria-invalid={invalidTargetPrefix}
      aria-describedby={invalidTargetPrefix ? 'preview-target-prefix-error' : undefined}
      placeholder="/memo/project/"
      autocomplete="off"
    />
  </div>

  <div class="mt-5">
    {#if preview.status === 'ready'}
      <dl class="grid gap-4">
        <div class="min-w-0"><dt class="text-xs text-muted-foreground">Template</dt><dd class="mt-1 break-words font-mono text-sm text-foreground">{preview.templateId}</dd></div>
        <div class="min-w-0"><dt class="text-xs text-muted-foreground">Title</dt><dd class="mt-1 break-words font-mono text-sm text-foreground">{preview.title}</dd></div>
        <div class="min-w-0"><dt class="text-xs text-muted-foreground">Path</dt><dd class="mt-1 break-words font-mono text-sm text-foreground">{preview.path}</dd></div>
      </dl>
      <div class="mt-5">
        <span class="text-xs text-muted-foreground">Content</span>
        <pre class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-[color:var(--koala-dashboard-code)] p-3 font-mono text-xs leading-5 text-foreground">{preview.content || '(empty)'}</pre>
      </div>
    {:else if preview.status === 'no_template'}
      <p class="text-sm text-muted-foreground">No Template matches <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{preview.targetPrefix}</code>. Blank Creation applies.</p>
    {:else if preview.status === 'invalid_template'}
      <p class="text-sm text-destructive">Selected Template is invalid: {preview.errors.map(issue => issue.message).join('; ')}</p>
    {:else}
      <p id="preview-target-prefix-error" class="text-sm text-destructive">{preview.message}</p>
    {/if}
  </div>
</aside>
