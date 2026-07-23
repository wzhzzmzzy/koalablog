<script lang="ts">
  import type { CreationTemplateV2, RendererMode, TemplateError } from '@/lib/files/types';
  import { validateTemplateV2 } from '@/lib/files/template';
  import { RENDERER_MODE } from '@/lib/files/types';
  import { Plus, Save } from '@lucide/svelte';
  import { actions } from 'astro:actions';
  import { onMount } from 'svelte';
  import TemplateCatalogList from './TemplateCatalogList.svelte';
  import TemplateEditor from './TemplateEditor.svelte';
  import {
    duplicateTemplateIds,
    duplicateTemplatePrefixes,
    normalizedTemplatePrefix,
    previewTemplateCatalog,
  } from './template-manager-model';
  import TemplatePreview from './TemplatePreview.svelte';

  let templates = $state<CreationTemplateV2[]>([]);
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
  const valid = $derived(templates.every(template => validateTemplateV2(template).ok));
  const selectedTemplate = $derived(templates[selectedIndex] ?? null);
  const selectedIssues = $derived(selectedTemplate ? templateIssues(selectedTemplate) : []);
  const invalidTemplateIndexes = $derived(new Set(templates.flatMap((template, index) => (
    templateHasIssues(template) ? [index] : []
  ))));
  const canSave = $derived(
    !loading
    && !saving
    && dirty
    && valid
    && duplicateIds.size === 0
    && duplicatePrefixes.size === 0,
  );

  function cloneTemplates(input: CreationTemplateV2[]) {
    return input.map(template => ({ ...template }));
  }

  function setCatalog(nextRevision: number, nextTemplates: CreationTemplateV2[]) {
    templates = cloneTemplates(nextTemplates);
    selectedIndex = templates.length === 0
      ? -1
      : Math.min(Math.max(selectedIndex, 0), templates.length - 1);
    revision = nextRevision;
    savedSnapshot = JSON.stringify(templates);
  }

  function templateIssues(template: CreationTemplateV2): TemplateError[] {
    const result = validateTemplateV2(template);
    return result.ok ? [] : result.error;
  }

  function templateHasIssues(template: CreationTemplateV2) {
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
      renderer: RENDERER_MODE.Markdown,
      content: '',
    });
    selectedIndex = templates.length - 1;
    message = '';
    error = '';
  }

  function updateSelectedTemplate(field: keyof Omit<CreationTemplateV2, 'renderer'>, value: string) {
    if (selectedTemplate)
      selectedTemplate[field] = value;
  }

  function updateSelectedRenderer(renderer: RendererMode) {
    if (selectedTemplate)
      selectedTemplate.renderer = renderer;
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

<section class="min-h-144" aria-labelledby="template-manager-title">
  <header class="flex flex-col items-start gap-4 border-b border-[--koala-border] py-4 md:flex-row md:items-center">
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 id="template-manager-title" class="m-0 text-2xl">Creation Templates</h1>
        {#if !loading}<span class="text-sm text-[--koala-subtext-0]">Revision {revision}</span>{/if}
      </div>
      {#if dirty}<p class="m-0 mt-1 text-sm text-[--koala-warning-text]">Unsaved changes</p>{/if}
    </div>
    <div class="flex w-full flex-wrap justify-start gap-2 md:ml-auto md:w-auto md:justify-end">
      <button type="button" class="btn !w-auto inline-flex items-center gap-2 px-3" onclick={addTemplate} disabled={loading}>
        <Plus size={20} /><span>Add Template</span>
      </button>
      <button type="button" class="btn !w-auto inline-flex items-center gap-2 px-3" onclick={saveTemplates} disabled={!canSave}>
        <Save size={20} /><span>{saving ? 'Saving...' : 'Save Catalog'}</span>
      </button>
    </div>
  </header>

  <div class="min-h-[1.625rem] py-2">
    {#if message}<p class="success m-0" role="status">{message}</p>{/if}
    {#if error}<p class="error m-0" role="alert">{error}</p>{/if}
  </div>

  {#if loading}
    <div class="grid min-h-96 place-items-center" role="status">Loading Templates...</div>
  {:else}
    <div class="grid min-h-[34rem] grid-cols-1 border-y border-[--koala-border] md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_minmax(18rem,22rem)]">
      <TemplateCatalogList {templates} {selectedIndex} {invalidTemplateIndexes} onselect={(index) => selectedIndex = index} />

      <div class="min-w-0">
        {#if selectedTemplate}
          <TemplateEditor
            template={selectedTemplate}
            issues={selectedIssues}
            duplicateId={duplicateIds.has(selectedTemplate.id)}
            duplicatePrefix={duplicatePrefixes.has(normalizedTemplatePrefix(selectedTemplate.prefix) ?? '')}
            onchange={updateSelectedTemplate}
            onrendererchange={updateSelectedRenderer}
            ondelete={removeSelectedTemplate}
          />
        {:else}
          <div class="grid min-h-96 place-items-center">
            <p class="m-0 text-[--koala-subtext-0]">Add a Template to configure its initial Path, Title, and Content.</p>
          </div>
        {/if}
      </div>

      <TemplatePreview preview={preview} targetPrefix={sampleTargetPrefix} onprefixchange={(value) => sampleTargetPrefix = value} />
    </div>
  {/if}
</section>
