<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput, uploadFile } from '@/lib/services/file-reader';

  interface Props {
		markdown: Markdown;
    source: MarkdownSource
	}

  let { markdown, source }: Props = $props()
  const isPreset = isPresetSource(source)

  let subjectValue = $state(markdown.subject ?? '')
  let textareaValue = $state(markdown.content ?? '')
  let previewHtml = $state('')

  // Generate preview when subject / content changed
  $effect(() => {
     refreshPreview()
  })

  let mdInstance: MarkdownIt | null = null
  onMount(async () => {
    mdInstance = await md()
    refreshPreview()
  })

  async function refreshPreview() {
    let previewMd = textareaValue
    if (subjectValue && !isPreset) {
      previewMd = `# ${subjectValue}\n\n${textareaValue}`
    }
    if (mdInstance) {
      previewHtml = mdInstance.render(previewMd)
      setTimeout(() => {
        (window as any).refreshCopyListener()
      }, 100)
    }
  }

  // Generate link when subject changed
  let userDefinedLink = false
  let linkValue = $state(markdown.link ?? '')
  $effect(() => {
    // keep link stable if user changed link manually or markdown has published
    if (!userDefinedLink && !markdown.id) {
      linkValue = linkGenerator(source as PostOrPage, subjectValue)
    }
  })
  function onInputLink(e: Event) {
    if (source === MarkdownSource.Post && !(e.target! as HTMLInputElement).value.startsWith('post/')) {
      linkValue = 'post/'
    }
    
    userDefinedLink = true
  }

  // Delete confirm popover
  let showDeleteConfirm = $state(false)
  
  function openDeleteConfirm() {
    showDeleteConfirm = true
  }
  
  function closeDeleteConfirm() {
    showDeleteConfirm = false
  }

  let uploadError = $state("")
  async function upload(e: Event) {
    e.preventDefault()
    const files = await pickFileWithFileInput()
    try {
      const fileKey = await uploadFile('post', files)
      if (fileKey.data) {
        const [source, key] = fileKey.data.split('/')
        textareaValue = `${textareaValue}\n ![](/api/oss/${source}_${key})`
      }
    } catch(e: any) {
      uploadError = e.message
    }
  }

  let showPreview = $state(false)
  function preview(e: Event) {
    e.preventDefault()
    showPreview = !showPreview
  }
</script>

<div class="w-full flex-1 flex flex-col">
  {#if uploadError}
    <p class="error">{uploadError}</p>
  {/if}

  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] p-6 rounded-lg max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">Confirm</h3>
        <p class="mb-6">Are you sure you want to delete this article? </p>
        <div class="flex justify-end gap-3">
          <button 
            class="!text-[--koala-editor-text]"
            onclick={closeDeleteConfirm}
          >
            Cancel
          </button>
          <form method="POST" action={actions.form.remove} class="inline">
            <input type="hidden" name="id" value={markdown.id} />
            <input type="hidden" name="link" value={markdown.link} />
            <input type="hidden" name="_action" value="delete" />
            <button 
              type="submit" 
              class="!text-[--koala-editor-text] !text-[--koala-error-text]"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <form method="POST" action={actions.form.save} class="flex-1 flex flex-col">
    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="id" value={markdown.id} />

    <div class="flex items-center gap-3">
      <button id="save" class="w-12">Save</button>
      <button id="upload" class="w-18" onclick={upload}>Upload</button>
      <button id="preview" class="w-20" onclick={preview}>{showPreview ? 'Edit' : 'Preview'}</button>
      {#if !isPreset && markdown.id > 0}
        <button 
          type="button" 
          class="!text-[--koala-error-text]" 
          onclick={openDeleteConfirm}
        >
          Delete
        </button>
      {/if}
    </div>

    <div class="flex my-3 {showPreview ? 'hidden' : ''}">
      <input
        id="subject-input"
        type={isPreset ? 'hidden' : 'text'}
        name="subject"
        class="border-r-2 border-r-solid border-r-[--koala-bg]"
        bind:value={subjectValue}
        placeholder="Title"
      />
      <input
        id="link-input"
        type={isPreset ? 'hidden' : 'text'}
        name="link"
        bind:value={linkValue}
        oninput={onInputLink}
        placeholder="Link"
      />
    </div>
    <textarea 
      class="p-1 text-sm w-full flex-1 box-border {showPreview ? 'hidden' : ''}" 
      name="content" 
      bind:value={textareaValue}
    ></textarea>
    <article id="preview-md" class="w-full {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>

  </form>
</div>
