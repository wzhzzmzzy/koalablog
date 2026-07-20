<script lang="ts">
  import type { TemplateCatalogPreview } from './template-manager-model';

  interface Props {
    preview: TemplateCatalogPreview;
    targetPrefix: string;
    onprefixchange: (value: string) => void;
  }

  let { preview, targetPrefix, onprefixchange }: Props = $props();
</script>

<aside class="col-span-1 min-w-0 border-t border-[--koala-border] bg-[--koala-input-bg] p-4 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0" aria-labelledby="template-preview-title" aria-live="polite">
  <h2 id="template-preview-title" class="m-0 text-base">Preview</h2>
  <label class="mt-4 flex min-w-0 flex-col gap-1.5" for="preview-target-prefix">
    <span>Target Path Prefix</span>
    <input
      id="preview-target-prefix"
      class="input box-border w-full rounded border border-[--koala-border] bg-[--koala-input-bg] font-mono text-sm text-[--koala-text] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1"
      value={targetPrefix}
      oninput={(event) => onprefixchange(event.currentTarget.value)}
      placeholder="/memo/project/"
      autocomplete="off"
    />
  </label>

  <div class="mt-4">
    {#if preview.status === 'ready'}
      <dl class="m-0 flex flex-col gap-3">
        <div class="min-w-0"><dt class="mb-0.5 text-xs text-[--koala-subtext-0]">Template</dt><dd class="m-0 break-words"><code>{preview.templateId}</code></dd></div>
        <div class="min-w-0"><dt class="mb-0.5 text-xs text-[--koala-subtext-0]">Title</dt><dd class="m-0 break-words"><code>{preview.title}</code></dd></div>
        <div class="min-w-0"><dt class="mb-0.5 text-xs text-[--koala-subtext-0]">Path</dt><dd class="m-0 break-words"><code>{preview.path}</code></dd></div>
      </dl>
      <div class="mt-4">
        <span class="text-sm text-[--koala-subtext-0]">Content</span>
        <pre class="m-0 mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-[--koala-border-subtle] p-3">{preview.content || '(empty)'}</pre>
      </div>
    {:else if preview.status === 'no_template'}
      <p class="m-0 text-sm">No Template matches <code>{preview.targetPrefix}</code>. Blank Creation applies.</p>
    {:else if preview.status === 'invalid_template'}
      <p class="error m-0 text-sm">Selected Template is invalid: {preview.errors.map(issue => issue.message).join('; ')}</p>
    {:else}
      <p class="error m-0 text-sm">{preview.message}</p>
    {/if}
  </div>
</aside>
