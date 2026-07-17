<script lang="ts">
  import type { CreationTemplateV1 } from '@/lib/files/types';
  import { validateTemplateV1 } from '@/lib/files/template';
  import { Plus, Save, Trash2 } from '@lucide/svelte';
  import { actions } from 'astro:actions';
  import { onMount } from 'svelte';
  import { duplicateTemplatePrefixes, normalizedTemplatePrefix, previewTemplateCatalog } from './template-utility-model';

  let templates = $state<CreationTemplateV1[]>([]);
  let revision = $state(0);
  let savedSnapshot = $state('[]');
  let sampleTargetPrefix = $state('/memo/project/');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  const duplicatePrefixes = $derived(duplicateTemplatePrefixes(templates));
  const dirty = $derived(JSON.stringify(templates) !== savedSnapshot);
  const preview = $derived(previewTemplateCatalog(templates, sampleTargetPrefix, new Date()));
  const valid = $derived(templates.every(template => validateTemplateV1(template).ok));
  const canSave = $derived(!loading && !saving && dirty && valid && duplicatePrefixes.size === 0);

  function cloneTemplates(input: CreationTemplateV1[]) {
    return input.map(template => ({ ...template }));
  }

  function setCatalog(nextRevision: number, nextTemplates: CreationTemplateV1[]) {
    templates = cloneTemplates(nextTemplates);
    revision = nextRevision;
    savedSnapshot = JSON.stringify(templates);
  }

  function templateMessages(template: CreationTemplateV1) {
    const result = validateTemplateV1(template);
    return result.ok ? [] : result.error.map(issue => `${issue.field}: ${issue.message}`);
  }

  function newTemplateId() {
    return globalThis.crypto?.randomUUID?.() ?? `template-${Date.now()}`;
  }

  function addTemplate() {
    templates.push({
      id: newTemplateId(),
      prefix: '/',
      titlePattern: 'untitled{{uniqueSuffix}}',
      pathPattern: '{{targetPrefix}}/{{title}}',
      content: '',
    });
    message = '';
  }

  function removeTemplate(index: number) {
    templates.splice(index, 1);
    message = '';
  }

  function catalogConflict(message: string) {
    try {
      const payload = JSON.parse(message) as { code?: string, currentRevision?: number };
      return payload.code === 'template_catalog_conflict' ? payload.currentRevision : null;
    } catch {
      return null;
    }
  }

  async function loadCatalog() {
    loading = true;
    error = '';
    const result = await actions.db.templates.read();
    loading = false;
    if (result.error) {
      error = result.error.message;
      return;
    }
    if (!result.data || result.data.status === 'absent') {
      error = 'Template Catalog is not initialized.';
      return;
    }
    setCatalog(result.data.catalog.revision, result.data.catalog.templates);
  }

  async function saveTemplates() {
    if (!canSave) return;
    saving = true;
    error = '';
    message = '';
    const result = await actions.db.templates.replace({ baseRevision: revision, templates });
    saving = false;
    if (result.error) {
      const currentRevision = catalogConflict(result.error.message);
      error = currentRevision === null
        ? result.error.message
        : `Templates changed in another session (server revision ${currentRevision}). Your unsaved edits were kept.`;
      return;
    }
    if (result.data) {
      setCatalog(result.data.revision, result.data.templates);
      message = 'Templates saved.';
    }
  }

  onMount(loadCatalog);
</script>

<section class="flex flex-col gap-4 rounded border border-[--koala-border] p-4" aria-labelledby="template-utility-title">
  <header class="flex flex-wrap items-center gap-2">
    <h3 id="template-utility-title" class="m-0">Creation Templates</h3>
    {#if dirty}<span class="text-sm text-[--koala-warning-text]">Unsaved changes</span>{/if}
    <div class="ml-auto flex gap-2">
      <button type="button" class="btn inline-flex items-center gap-2" onclick={addTemplate} disabled={loading}>
        <Plus size={20} /><span>Add Template</span>
      </button>
      <button type="button" class="btn inline-flex items-center gap-2" onclick={saveTemplates} disabled={!canSave}>
        <Save size={20} /><span>{saving ? 'Saving...' : 'Save Templates'}</span>
      </button>
    </div>
  </header>

  {#if loading}
    <p>Loading Templates...</p>
  {:else}
    {#if message}<p class="success m-0" role="status">{message}</p>{/if}
    {#if error}<p class="error m-0" role="alert">{error}</p>{/if}
    {#if templates.length === 0}<p class="m-0 text-[--koala-subtext-0]">The stored Catalog is empty. New Files use Blank Creation.</p>{/if}

    <div class="flex flex-col gap-4">
      {#each templates as template, index (template.id)}
        <article class="flex flex-col gap-3 rounded border border-[--koala-border-subtle] p-3">
          <div class="flex items-center gap-2">
            <strong class="break-all">{template.id}</strong>
            <button type="button" class="icon btn ml-auto !text-[--koala-error-text]" onclick={() => removeTemplate(index)} aria-label="Delete Template" title="Delete Template">
              <Trash2 size={20} />
            </button>
          </div>

          <label class="flex flex-col gap-1">Prefix
            <input class="input w-full font-mono" bind:value={template.prefix} placeholder="/memo/" />
          </label>
          <label class="flex flex-col gap-1">Title pattern
            <input class="input w-full font-mono" bind:value={template.titlePattern} placeholder={'{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}'} />
          </label>
          <label class="flex flex-col gap-1">Absolute Path pattern
            <input class="input w-full font-mono" bind:value={template.pathPattern} placeholder={'{{targetPrefix}}/{{title}}'} />
          </label>
          <label class="flex flex-col gap-1">Content
            <textarea class="input min-h-32 w-full font-mono" bind:value={template.content}></textarea>
          </label>

          {#if duplicatePrefixes.has(normalizedTemplatePrefix(template.prefix) ?? '')}
            <p class="error m-0">Duplicate normalized Prefix.</p>
          {/if}
          {#each templateMessages(template) as issue}
            <p class="error m-0 text-sm">{issue}</p>
          {/each}
        </article>
      {/each}
    </div>

    <aside class="flex flex-col gap-2 rounded bg-[--koala-input-bg] p-3" aria-live="polite">
      <label class="flex flex-col gap-1">Preview target Prefix
        <input class="input w-full font-mono" bind:value={sampleTargetPrefix} placeholder="/memo/project/" />
      </label>
      {#if preview.status === 'ready'}
        <p class="m-0">Template: <code>{preview.templateId}</code></p>
        <p class="m-0 break-all">Title: <code>{preview.title}</code></p>
        <p class="m-0 break-all">Path: <code>{preview.path}</code></p>
        <pre class="m-0 max-h-48 overflow-auto whitespace-pre-wrap">{preview.content}</pre>
      {:else if preview.status === 'no_template'}
        <p class="m-0">No Template matches <code>{preview.targetPrefix}</code>; Blank Creation applies.</p>
      {:else if preview.status === 'invalid_template'}
        <p class="error m-0">Selected Template is invalid: {preview.errors.map(issue => issue.message).join('; ')}</p>
      {:else}
        <p class="error m-0">{preview.message}</p>
      {/if}
    </aside>
  {/if}
</section>
