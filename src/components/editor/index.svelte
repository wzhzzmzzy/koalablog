<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { convertToWebP, pickFileWithFileInput, uploadFile } from '@/lib/services/file-reader';

  interface Props {
		markdown: Markdown;
    source: MarkdownSource
	}

  let editorForm: HTMLFormElement
  let { markdown, source }: Props = $props()
  const isPreset = isPresetSource(source)

  let subjectValue = $state(markdown.subject ?? '')
  let textareaValue = $state(markdown.content ?? '')
  let privateValue = $state(markdown.private ?? false)
  let previewHtml = $state('')

  // Generate preview when subject / content changed
  $effect(() => {
     refreshPreview()
  })

  let mdInstance: MarkdownIt | null = null
  onMount(async () => {
    const allPosts = await actions.db.markdown.all({ source: 'post' })
    mdInstance = await md({ allPostLinks: allPosts.data?.posts })
    refreshPreview()

    if (isPreset && markdown.id === 0) {
      formWarn = `Your blog doesn't have a ${markdown.subject}, press [Save] to create it with default content`
    }
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

  let formError = $state('')
  let formWarn = $state('')
  let success = $state('')
  async function upload(e: Event) {
    e.preventDefault()
    const files = await pickFileWithFileInput()
    try {
      const blob = await convertToWebP(files[0])
      const webpFileName = files[0].name.replace(/\.[^/.]+$/, '.webp')
      const fileKey = await uploadFile('article', blob, webpFileName)
      if (fileKey.data) {
        const [source, key] = fileKey.data.split('/')
        textareaValue = `${textareaValue}\n ![](/api/oss/${source}_${key})`
        success = 'Uploaded Successfully'
      }
    } catch(e: any) {
      formError = e.message
    }
  }

  let showPreview = $state(false)
  function preview(e: Event) {
    e.preventDefault()
    showPreview = !showPreview
  }

  let copyBtnText = $state('Link')
  function copyLink() {  
    const supportClipboard = navigator && 'clipboard' in navigator
    if (supportClipboard) {
      navigator.clipboard.writeText(
        `${window.location.origin}/${markdown.link}`
      ).then(() => {
        copyBtnText = 'Copied'
        setTimeout(() => {
          copyBtnText = 'Link'
        }, 2000)
      })
    }
  }

  let toolbarVisible = $state(false)
  function toggleToolbar(e: Event) {
    e.preventDefault()
    toolbarVisible = !toolbarVisible
  }

  async function save(e: Event) {
    e.preventDefault()

    const previewEl = document.getElementById('preview-md')
    const outgoingLinkEls: HTMLAnchorElement[] = Array.from(previewEl?.querySelectorAll('a.outgoing-link') || [])

    const formData = new FormData(editorForm)
    formData.append('outgoingLinks', JSON.stringify(outgoingLinkEls.map(i => ({
      subject: i.textContent,
      link: i.dataset.link
    })).filter(i => !!i.link)))
    const result = await actions.form.save(formData)

    if (result.error) {
      formError = result.error.message
      success = ''
    } else {
      formWarn = ''
      formError = ''
      success = 'Saved Success'
      if (result.data?.[0])
      markdown = result.data[0]
    }
  }
</script>

<div class="w-full flex-1 flex flex-col">
  {#if formWarn}
    <p class="warning">{formWarn}</p>
  {/if}

  {#if formError}
    <p class="error">{formError}</p>
  {/if}

  {#if success}
    <p class="success">{success}</p>
  {/if}

  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[50vw] sm:max-w-md sm:w-full">
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

  <form bind:this={editorForm} method="POST" class="flex-1 flex flex-col">

    <div class="flex justify-between">
    {#if source === MarkdownSource.Post}
      <h2 class="editor-title">{ !markdown.id ? 'New Post' : 'Edit Post' }</h2>
    {:else if source === MarkdownSource.Page}
      <h2 class="editor-title">{ !markdown.id ? 'New Page' : 'Edit Page' }</h2>
    {:else}
      <h2 class="editor-title">{ markdown.subject }</h2>
    {/if}
      <div>
        <button id="save" class="w-12" onclick={save}>Save</button>
        <button onclick={toggleToolbar}>Actions</button>
      </div>
    </div>
    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="id" value={markdown.id} />

    <div class="flex items-center gap-3">
    {#if toolbarVisible}
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
        <button 
          type="button" 
          onclick={copyLink}
        >
          {copyBtnText}
        </button>
      {/if}
    {/if}
    </div>

    <div class="flex mb-2 {toolbarVisible ? 'mt-2' : ''} {showPreview ? 'hidden' : ''} flex-col sm:flex-row sm:items-center">
      <input
        id="subject-input"
        type={isPreset ? 'hidden' : 'text'}
        name="subject"
        class="mb-1 sm:mb-0 sm:border-r-2 sm:border-r-solid sm:border-r-[--koala-bg] sm:flex-1"
        bind:value={subjectValue}
        placeholder="Title"
      />
      <input
        id="link-input"
        class="sm:flex-1"
        type={isPreset ? 'hidden' : 'text'}
        name="link"
        bind:value={linkValue}
        oninput={onInputLink}
        placeholder="Link"
      />
      {#if source === MarkdownSource.Page}
        <div class="mt-2 sm:mt-0">
          <input type="checkbox" name="private" bind:checked={privateValue} />
          <label for="private">Private</label>
        </div>
      {/if}
    </div>
    <textarea 
      class="p-1 text-sm w-full flex-1 box-border {showPreview ? 'hidden' : ''}" 
      name="content" 
      placeholder="Type here..."
      bind:value={textareaValue}
    ></textarea>
    <article id="preview-md" class="w-full {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>

  </form>
</div>
