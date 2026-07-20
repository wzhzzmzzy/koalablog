<script lang="ts">
  import type { CreationTemplateV1, TemplateError, TemplateField } from '@/lib/files/types';
  import { validateTemplateV1 } from '@/lib/files/template';
  import { CircleAlert, Plus, Save, Trash2 } from '@lucide/svelte';
  import { actions } from 'astro:actions';
  import { onMount } from 'svelte';
  import {
    duplicateTemplateIds,
    duplicateTemplatePrefixes,
    normalizedTemplatePrefix,
    previewTemplateCatalog,
  } from './template-manager-model';

  let templates = $state<CreationTemplateV1[]>([]);
  let selectedIndex = $state(-1);
  let revision = $state(0);
  let savedSnapshot = $state('[]');
  let sampleTargetPrefix = $state('/memo/project/');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  const duplicateIds = $derived(duplicateTemplateIds(templates));
  const duplicatePrefixes = $derived(duplicateTemplatePrefixes(templates));
  const dirty = $derived(JSON.stringify(templates) !== savedSnapshot);
  const preview = $derived(previewTemplateCatalog(templates, sampleTargetPrefix, new Date()));
  const valid = $derived(templates.every(template => validateTemplateV1(template).ok));
  const canSave = $derived(
    !loading
    && !saving
    && dirty
    && valid
    && duplicateIds.size === 0
    && duplicatePrefixes.size === 0,
  );

  function cloneTemplates(input: CreationTemplateV1[]) {
    return input.map(template => ({ ...template }));
  }

  function setCatalog(nextRevision: number, nextTemplates: CreationTemplateV1[]) {
    templates = cloneTemplates(nextTemplates);
    selectedIndex = templates.length === 0
      ? -1
      : Math.min(Math.max(selectedIndex, 0), templates.length - 1);
    revision = nextRevision;
    savedSnapshot = JSON.stringify(templates);
  }

  function templateIssues(template: CreationTemplateV1): TemplateError[] {
    const result = validateTemplateV1(template);
    return result.ok ? [] : result.error;
  }

  function fieldIssues(template: CreationTemplateV1, field: TemplateField) {
    return templateIssues(template).filter(issue => issue.field === field);
  }

  function templateHasIssues(template: CreationTemplateV1) {
    return templateIssues(template).length > 0
      || duplicateIds.has(template.id)
      || duplicatePrefixes.has(normalizedTemplatePrefix(template.prefix) ?? '');
  }

  function newTemplateId() {
    const ids = new Set(templates.map(template => template.id));
    let index = templates.length + 1;
    while (ids.has(`template-${index}`)) index += 1;
    return `template-${index}`;
  }

  function addTemplate() {
    templates.push({
      id: newTemplateId(),
      prefix: '/',
      titlePattern: 'untitled{{uniqueSuffix}}',
      pathPattern: '{{targetPrefix}}/{{title}}',
      content: '',
    });
    selectedIndex = templates.length - 1;
    message = '';
    error = '';
  }

  function removeSelectedTemplate() {
    if (selectedIndex < 0) return;
    templates.splice(selectedIndex, 1);
    selectedIndex = templates.length === 0 ? -1 : Math.min(selectedIndex, templates.length - 1);
    message = '';
    error = '';
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
      message = 'Template Catalog saved.';
    }
  }

  onMount(loadCatalog);
</script>

<section class="template-manager" aria-labelledby="template-manager-title">
  <header class="template-toolbar">
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 id="template-manager-title" class="m-0 text-2xl">Creation Templates</h1>
        {#if !loading}<span class="text-sm text-[--koala-subtext-0]">Revision {revision}</span>{/if}
      </div>
      {#if dirty}<p class="m-0 mt-1 text-sm text-[--koala-warning-text]">Unsaved changes</p>{/if}
    </div>
    <div class="ml-auto flex flex-wrap justify-end gap-2">
      <button type="button" class="btn !w-auto inline-flex items-center gap-2 px-3" onclick={addTemplate} disabled={loading}>
        <Plus size={18} /><span>Add Template</span>
      </button>
      <button type="button" class="btn !w-auto inline-flex items-center gap-2 px-3" onclick={saveTemplates} disabled={!canSave}>
        <Save size={18} /><span>{saving ? 'Saving...' : 'Save Catalog'}</span>
      </button>
    </div>
  </header>

  <div class="status-region">
    {#if message}<p class="success m-0" role="status">{message}</p>{/if}
    {#if error}<p class="error m-0" role="alert">{error}</p>{/if}
  </div>

  {#if loading}
    <div class="loading-state" role="status">Loading Templates...</div>
  {:else}
    <div class="template-workspace">
      <aside class="template-list" aria-label="Template Catalog">
        <div class="template-list-heading">
          <h2 class="m-0 text-base">Catalog</h2>
          <span class="text-sm text-[--koala-subtext-0]">{templates.length}</span>
        </div>

        {#if templates.length === 0}
          <p class="empty-list m-0 text-sm text-[--koala-subtext-0]">No templates. New Files use Blank Creation.</p>
        {:else}
          <div class="template-list-items" role="list">
            {#each templates as template, index}
              <button
                type="button"
                class:active={selectedIndex === index}
                class="template-list-item"
                onclick={() => selectedIndex = index}
                aria-pressed={selectedIndex === index}
              >
                <span class="min-w-0">
                  <strong class="block truncate font-normal">{template.prefix || 'Invalid Prefix'}</strong>
                  <span class="block truncate text-xs text-[--koala-subtext-0]">{template.id || 'Missing ID'}</span>
                </span>
                {#if templateHasIssues(template)}
                  <CircleAlert class="shrink-0 text-[--koala-error-text]" size={17} aria-label="Template has errors" />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </aside>

      <div class="template-form-panel">
        {#if selectedIndex >= 0 && templates[selectedIndex]}
          {@const template = templates[selectedIndex]}
          <div class="template-form-heading">
            <div class="min-w-0">
              <p class="m-0 text-xs uppercase text-[--koala-subtext-0]">Selected Template</p>
              <h2 class="m-0 mt-1 truncate text-lg">{template.prefix || 'Invalid Prefix'}</h2>
            </div>
            <button
              type="button"
              class="icon btn !text-[--koala-error-text]"
              onclick={removeSelectedTemplate}
              aria-label="Delete Template"
              title="Delete Template"
            >
              <Trash2 size={19} />
            </button>
          </div>

          <form class="template-form" onsubmit={(event) => event.preventDefault()}>
            <label class="field" for="template-id">
              <span>Template ID</span>
              <input id="template-id" class="input field-control font-mono" bind:value={template.id} autocomplete="off" />
            </label>
            {#if duplicateIds.has(template.id)}
              <p class="field-error">Duplicate Template ID.</p>
            {/if}
            {#each fieldIssues(template, 'id') as issue}
              <p class="field-error">{issue.message}</p>
            {/each}

            <label class="field" for="template-prefix">
              <span>Path Prefix</span>
              <input id="template-prefix" class="input field-control font-mono" bind:value={template.prefix} placeholder="/memo/" autocomplete="off" />
            </label>
            {#if duplicatePrefixes.has(normalizedTemplatePrefix(template.prefix) ?? '')}
              <p class="field-error">Duplicate normalized Path Prefix.</p>
            {/if}
            {#each fieldIssues(template, 'prefix') as issue}
              <p class="field-error">{issue.message}</p>
            {/each}

            <div class="field-grid">
              <div>
                <label class="field" for="template-title-pattern">
                  <span>Title Pattern</span>
                  <input id="template-title-pattern" class="input field-control font-mono" bind:value={template.titlePattern} placeholder={'{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}'} autocomplete="off" />
                </label>
                {#each fieldIssues(template, 'titlePattern') as issue}
                  <p class="field-error">{issue.message}</p>
                {/each}
              </div>

              <div>
                <label class="field" for="template-path-pattern">
                  <span>Absolute Path Pattern</span>
                  <input id="template-path-pattern" class="input field-control font-mono" bind:value={template.pathPattern} placeholder={'{{targetPrefix}}/{{title}}'} autocomplete="off" />
                </label>
                {#each fieldIssues(template, 'pathPattern') as issue}
                  <p class="field-error">{issue.message}</p>
                {/each}
              </div>
            </div>

            <label class="field content-field" for="template-content">
              <span>Content</span>
              <textarea id="template-content" class="field-control font-mono" bind:value={template.content} spellcheck="false"></textarea>
            </label>
            {#each fieldIssues(template, 'content') as issue}
              <p class="field-error">{issue.message}</p>
            {/each}
          </form>
        {:else}
          <div class="empty-editor">
            <p class="m-0 text-[--koala-subtext-0]">Add a Template to configure its initial Path, Title, and Content.</p>
          </div>
        {/if}
      </div>

      <aside class="preview-panel" aria-labelledby="template-preview-title" aria-live="polite">
        <h2 id="template-preview-title" class="m-0 text-base">Preview</h2>
        <label class="field mt-4" for="preview-target-prefix">
          <span>Target Path Prefix</span>
          <input id="preview-target-prefix" class="input field-control font-mono" bind:value={sampleTargetPrefix} placeholder="/memo/project/" autocomplete="off" />
        </label>

        <div class="preview-result">
          {#if preview.status === 'ready'}
            <dl class="preview-metadata">
              <div><dt>Template</dt><dd><code>{preview.templateId}</code></dd></div>
              <div><dt>Title</dt><dd><code>{preview.title}</code></dd></div>
              <div><dt>Path</dt><dd><code>{preview.path}</code></dd></div>
            </dl>
            <div class="preview-content">
              <span class="text-sm text-[--koala-subtext-0]">Content</span>
              <pre>{preview.content || '(empty)'}</pre>
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
    </div>
  {/if}
</section>

<style>
  .template-manager {
    min-height: 36rem;
  }

  .template-toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--koala-border);
  }

  .status-region {
    min-height: 1.625rem;
    padding: 0.5rem 0;
  }

  .loading-state,
  .empty-editor {
    display: grid;
    min-height: 24rem;
    place-items: center;
  }

  .template-workspace {
    display: grid;
    grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr);
    min-height: 34rem;
    border-top: 1px solid var(--koala-border);
    border-bottom: 1px solid var(--koala-border);
  }

  .template-list {
    min-width: 0;
    border-right: 1px solid var(--koala-border);
    background: var(--koala-input-bg);
  }

  .template-list-heading,
  .template-form-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--koala-border-subtle);
  }

  .template-list-items {
    max-height: 38rem;
    overflow: auto;
  }

  .template-list-item {
    display: flex;
    width: 100%;
    min-height: 3.75rem;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    box-sizing: border-box;
    padding: 0.625rem 0.875rem;
    border: 0;
    border-left: 3px solid transparent;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .template-list-item:hover,
  .template-list-item.active {
    background: var(--koala-icon-btn-bg);
  }

  .template-list-item.active {
    border-left-color: var(--koala-link);
  }

  .empty-list {
    padding: 1rem;
    line-height: 1.5;
  }

  .template-form-panel {
    min-width: 0;
  }

  .template-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
  }

  .field,
  .field-grid > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .field-control {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--koala-border);
    border-radius: 4px;
    background: var(--koala-input-bg);
    color: var(--koala-text);
    font-size: 0.875rem;
  }

  textarea.field-control {
    min-height: 21rem;
    padding: 0.75rem;
    border: 1px solid var(--koala-border) !important;
    background: var(--koala-input-bg) !important;
    color: var(--koala-text) !important;
    resize: vertical;
    line-height: 1.5;
  }

  .field-control:focus-visible,
  .template-list-item:focus-visible {
    outline: 2px solid var(--koala-link);
    outline-offset: 1px;
  }

  .field-error {
    margin: -0.125rem 0 0;
    color: var(--koala-error-text);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .preview-panel {
    grid-column: 1 / -1;
    min-width: 0;
    padding: 1rem;
    border-top: 1px solid var(--koala-border);
    background: var(--koala-input-bg);
  }

  .preview-result {
    margin-top: 1rem;
  }

  .preview-metadata {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0;
  }

  .preview-metadata div {
    min-width: 0;
  }

  .preview-metadata dt {
    margin-bottom: 0.125rem;
    color: var(--koala-subtext-0);
    font-size: 0.75rem;
  }

  .preview-metadata dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .preview-content {
    margin-top: 1rem;
  }

  .preview-content pre {
    max-height: 18rem;
    margin: 0.375rem 0 0;
    padding: 0.75rem;
    overflow: auto;
    border: 1px solid var(--koala-border-subtle);
    border-radius: 4px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (min-width: 1180px) {
    .template-workspace {
      grid-template-columns: 16rem minmax(0, 1fr) minmax(18rem, 22rem);
    }

    .preview-panel {
      grid-column: auto;
      border-top: 0;
      border-left: 1px solid var(--koala-border);
    }

    .field-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .template-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .template-toolbar > div:last-child {
      width: 100%;
      margin-left: 0;
      justify-content: flex-start;
    }

    .template-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .template-list {
      border-right: 0;
      border-bottom: 1px solid var(--koala-border);
    }

    .template-list-items {
      max-height: 13rem;
    }

    .field-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .preview-panel {
      grid-column: auto;
    }
  }
</style>
