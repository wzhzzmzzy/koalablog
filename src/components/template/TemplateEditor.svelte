<script lang="ts">
  import type { CreationTemplateV2, RendererMode, TemplateError, TemplateField } from '@/lib/files/types';
  import { RENDERER_MODE } from '@/lib/files/types';
  import { Trash2 } from '@lucide/svelte';

  interface Props {
    template: CreationTemplateV2;
    issues: TemplateError[];
    duplicateId: boolean;
    duplicatePrefix: boolean;
    onchange: (field: keyof Omit<CreationTemplateV2, 'renderer'>, value: string) => void;
    onrendererchange: (renderer: RendererMode) => void;
    ondelete: () => void;
  }

  let { template, issues, duplicateId, duplicatePrefix, onchange, onrendererchange, ondelete }: Props = $props();

  const idIssues = $derived(fieldIssues('id'));
  const prefixIssues = $derived(fieldIssues('prefix'));
  const titleIssues = $derived(fieldIssues('titlePattern'));
  const pathIssues = $derived(fieldIssues('pathPattern'));
  const rendererIssues = $derived(fieldIssues('renderer'));
  const contentIssues = $derived(fieldIssues('content'));

  function fieldIssues(field: TemplateField) {
    return issues.filter(issue => issue.field === field);
  }
</script>

<div class="flex min-h-14 items-center justify-between gap-3 border-b border-[--koala-border-subtle] px-4">
  <div class="min-w-0">
    <p class="m-0 text-xs uppercase text-[--koala-subtext-0]">Selected Template</p>
    <h2 class="m-0 mt-1 truncate text-lg">{template.prefix || 'Invalid Prefix'}</h2>
  </div>
  <button
    type="button"
    class="icon btn !text-[--koala-error-text]"
    onclick={ondelete}
    aria-label="Delete Template"
    title="Delete Template"
  >
    <Trash2 size={20} />
  </button>
</div>

<form class="flex flex-col gap-2 p-5" onsubmit={(event) => event.preventDefault()}>
  <label class="flex min-w-0 flex-col gap-1.5" for="template-id">
    <span>Template ID</span>
    <input
      id="template-id"
      class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] font-mono text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
      value={template.id}
      oninput={(event) => onchange('id', event.currentTarget.value)}
      aria-invalid={duplicateId || idIssues.length > 0}
      aria-describedby={duplicateId || idIssues.length > 0 ? 'template-id-errors' : undefined}
      autocomplete="off"
    />
  </label>
  {#if duplicateId || idIssues.length > 0}
    <div id="template-id-errors">
      {#if duplicateId}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">Duplicate Template ID.</p>{/if}
      {#each idIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
    </div>
  {/if}

  <label class="flex min-w-0 flex-col gap-1.5" for="template-prefix">
    <span>Path Prefix</span>
    <input
      id="template-prefix"
      class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] font-mono text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
      value={template.prefix}
      oninput={(event) => onchange('prefix', event.currentTarget.value)}
      aria-invalid={duplicatePrefix || prefixIssues.length > 0}
      aria-describedby={duplicatePrefix || prefixIssues.length > 0 ? 'template-prefix-errors' : undefined}
      placeholder="/memo/"
      autocomplete="off"
    />
  </label>
  {#if duplicatePrefix || prefixIssues.length > 0}
    <div id="template-prefix-errors">
      {#if duplicatePrefix}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">Duplicate normalized Path Prefix.</p>{/if}
      {#each prefixIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
    </div>
  {/if}

  <label class="flex min-w-0 flex-col gap-1.5" for="template-renderer">
    <span>Renderer</span>
    <select
      id="template-renderer"
      class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
      value={template.renderer}
      onchange={(event) => onrendererchange(event.currentTarget.value as RendererMode)}
      aria-invalid={rendererIssues.length > 0}
      aria-describedby={rendererIssues.length > 0 ? 'template-renderer-errors' : undefined}
    >
      <option value={RENDERER_MODE.Markdown}>Markdown</option>
      <option value={RENDERER_MODE.Svelte}>Svelte</option>
    </select>
  </label>
  {#if rendererIssues.length > 0}
    <div id="template-renderer-errors">
      {#each rendererIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-1">
    <div class="flex min-w-0 flex-col gap-1.5">
      <label class="flex min-w-0 flex-col gap-1.5" for="template-title-pattern">
        <span>Title Pattern</span>
        <input
          id="template-title-pattern"
          class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] font-mono text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
          value={template.titlePattern}
          oninput={(event) => onchange('titlePattern', event.currentTarget.value)}
          aria-invalid={titleIssues.length > 0}
          aria-describedby={titleIssues.length > 0 ? 'template-title-pattern-errors' : undefined}
          placeholder={'{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}'}
          autocomplete="off"
        />
      </label>
      {#if titleIssues.length > 0}
        <div id="template-title-pattern-errors">
          {#each titleIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
        </div>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-1.5">
      <label class="flex min-w-0 flex-col gap-1.5" for="template-path-pattern">
        <span>Absolute Path Pattern</span>
        <input
          id="template-path-pattern"
          class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] font-mono text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
          value={template.pathPattern}
          oninput={(event) => onchange('pathPattern', event.currentTarget.value)}
          aria-invalid={pathIssues.length > 0}
          aria-describedby={pathIssues.length > 0 ? 'template-path-pattern-errors' : undefined}
          placeholder={'{{targetPrefix}}/{{title}}'}
          autocomplete="off"
        />
      </label>
      {#if pathIssues.length > 0}
        <div id="template-path-pattern-errors">
          {#each pathIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
        </div>
      {/if}
    </div>
  </div>

  <label class="flex min-w-0 flex-col gap-1.5" for="template-content">
    <span>Content</span>
    <textarea
      id="template-content"
      class="box-border min-h-84 w-full resize-y rounded !border !border-[--koala-border] !bg-[--koala-input-bg] p-3 font-mono text-sm leading-6 !text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
      value={template.content}
      oninput={(event) => onchange('content', event.currentTarget.value)}
      aria-invalid={contentIssues.length > 0}
      aria-describedby={contentIssues.length > 0 ? 'template-content-errors' : undefined}
      spellcheck="false"
    ></textarea>
  </label>
  {#if contentIssues.length > 0}
    <div id="template-content-errors">
      {#each contentIssues as issue}<p class="m-0 text-[0.8125rem] leading-5 text-[--koala-error-text]">{issue.message}</p>{/each}
    </div>
  {/if}
</form>
