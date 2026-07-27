<script lang="ts">
  import type { CreationTemplateV2, RendererMode, TemplateError, TemplateField } from '@/lib/files/types'
  import { RENDERER_MODE } from '@/lib/files/types'
  import { Trash2 } from '@lucide/svelte'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Textarea } from '@/components/ui/textarea'

  interface Props {
    template: CreationTemplateV2
    issues: TemplateError[]
    duplicateId: boolean
    duplicatePrefix: boolean
    onchange: (field: keyof Omit<CreationTemplateV2, 'renderer'>, value: string) => void
    onrendererchange: (renderer: RendererMode) => void
    ondelete: () => void
  }

  let { template, issues, duplicateId, duplicatePrefix, onchange, onrendererchange, ondelete }: Props = $props()

  const idIssues = $derived(fieldIssues('id'))
  const prefixIssues = $derived(fieldIssues('prefix'))
  const titleIssues = $derived(fieldIssues('titlePattern'))
  const pathIssues = $derived(fieldIssues('pathPattern'))
  const rendererIssues = $derived(fieldIssues('renderer'))
  const contentIssues = $derived(fieldIssues('content'))

  function fieldIssues(field: TemplateField) {
    return issues.filter(issue => issue.field === field)
  }
</script>

<div class="flex min-h-16 items-center justify-between gap-3 border-b border-border px-5">
  <div class="min-w-0">
    <p class="text-xs font-medium tracking-wide text-muted-foreground">Selected template</p>
    <h2 class="mt-1 truncate text-lg font-medium text-foreground">{template.prefix || 'Invalid Prefix'}</h2>
  </div>
  <Button type="button" variant="ghost" size="icon-sm" onclick={ondelete} aria-label="Delete Template" title="Delete Template">
    <Trash2 class="text-destructive" />
  </Button>
</div>

<form class="grid gap-5 p-5" onsubmit={(event) => event.preventDefault()}>
  <div class="grid gap-2">
    <Label for="template-id">Template ID</Label>
    <Input
      id="template-id"
      class="font-mono"
      value={template.id}
      oninput={(event) => onchange('id', event.currentTarget.value)}
      aria-invalid={duplicateId || idIssues.length > 0}
      aria-describedby={duplicateId || idIssues.length > 0 ? 'template-id-errors' : undefined}
      autocomplete="off"
    />
    {#if duplicateId || idIssues.length > 0}
      <div id="template-id-errors">
        {#if duplicateId}<p class="text-[0.8125rem] leading-5 text-destructive">Duplicate Template ID.</p>{/if}
        {#each idIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
      </div>
    {/if}
  </div>

  <div class="grid gap-2">
    <Label for="template-prefix">Path Prefix</Label>
    <Input
      id="template-prefix"
      class="font-mono"
      value={template.prefix}
      oninput={(event) => onchange('prefix', event.currentTarget.value)}
      aria-invalid={duplicatePrefix || prefixIssues.length > 0}
      aria-describedby={duplicatePrefix || prefixIssues.length > 0 ? 'template-prefix-errors' : undefined}
      placeholder="/memo/"
      autocomplete="off"
    />
    {#if duplicatePrefix || prefixIssues.length > 0}
      <div id="template-prefix-errors">
        {#if duplicatePrefix}<p class="text-[0.8125rem] leading-5 text-destructive">Duplicate normalized Path Prefix.</p>{/if}
        {#each prefixIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
      </div>
    {/if}
  </div>

  <div class="grid gap-2">
    <Label for="template-renderer">Renderer</Label>
    <select
      id="template-renderer"
      class="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:ring-3"
      value={template.renderer}
      onchange={(event) => onrendererchange(event.currentTarget.value as RendererMode)}
      aria-invalid={rendererIssues.length > 0}
      aria-describedby={rendererIssues.length > 0 ? 'template-renderer-errors' : undefined}
    >
      <option value={RENDERER_MODE.Markdown}>Markdown</option>
      <option value={RENDERER_MODE.Svelte}>Svelte</option>
    </select>
    {#if rendererIssues.length > 0}
      <div id="template-renderer-errors">
        {#each rendererIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-1">
    <div class="grid gap-2">
      <Label for="template-title-pattern">Title Pattern</Label>
      <Input
        id="template-title-pattern"
        class="font-mono"
        value={template.titlePattern}
        oninput={(event) => onchange('titlePattern', event.currentTarget.value)}
        aria-invalid={titleIssues.length > 0}
        aria-describedby={titleIssues.length > 0 ? 'template-title-pattern-errors' : undefined}
        placeholder={'{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}'}
        autocomplete="off"
      />
      {#if titleIssues.length > 0}
        <div id="template-title-pattern-errors">
          {#each titleIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
        </div>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="template-path-pattern">Absolute Path Pattern</Label>
      <Input
        id="template-path-pattern"
        class="font-mono"
        value={template.pathPattern}
        oninput={(event) => onchange('pathPattern', event.currentTarget.value)}
        aria-invalid={pathIssues.length > 0}
        aria-describedby={pathIssues.length > 0 ? 'template-path-pattern-errors' : undefined}
        placeholder={'{{targetPrefix}}/{{title}}'}
        autocomplete="off"
      />
      {#if pathIssues.length > 0}
        <div id="template-path-pattern-errors">
          {#each pathIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="grid gap-2">
    <Label for="template-content">Content</Label>
    <Textarea
      id="template-content"
      class="min-h-84 resize-y font-mono leading-6"
      value={template.content}
      oninput={(event) => onchange('content', event.currentTarget.value)}
      aria-invalid={contentIssues.length > 0}
      aria-describedby={contentIssues.length > 0 ? 'template-content-errors' : undefined}
      spellcheck="false"
    />
    {#if contentIssues.length > 0}
      <div id="template-content-errors">
        {#each contentIssues as issue}<p class="text-[0.8125rem] leading-5 text-destructive">{issue.message}</p>{/each}
      </div>
    {/if}
  </div>
</form>
