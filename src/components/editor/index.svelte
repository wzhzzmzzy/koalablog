<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { convertToWebP, pickFileWithFileInput, uploadFile } from '@/lib/services/file-reader';
  import { parseJson } from '@/lib/utils/parse-json';
  import type { DoubleLinkPluginOptions } from '@/lib/markdown/double-link-plugin';
  import { Save, Ellipsis, Upload, Eye, SquarePen, Trash2, Link, Check, X, ArrowLeft } from '@lucide/svelte';
  import { generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition } from './utils';

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
  let allPosts: Markdown[] = []

  onMount(async () => {
    const allPostsFromDB = await actions.db.markdown.all({ source: 'post' })
    allPosts = allPostsFromDB.data?.posts || [];
    
    mdInstance = await md({ allPostLinks: allPosts })
    refreshPreview()

    if (isPreset && markdown.id === 0) {
      formWarn = `Your blog doesn't have a ${markdown.subject}, press [Save] to create it with default content`
    }
  })

  async function refreshPreview() {
    let previewMd = textareaValue
    if (subjectValue && !isPreset && source !== MarkdownSource.Page) {
      previewMd = `# ${subjectValue}\n\n${textareaValue}`
    }
    if (mdInstance) {
      previewHtml = mdInstance.render(previewMd)
      setTimeout(() => {
        window.refreshCopyListener();
        window.refreshTagListener();
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

  async function processFileUpload(file: File, placeholder?: string) {
    try {
      const blob = await convertToWebP(file)
      // Compatibility Check: If browser doesn't support WebP encoding, it falls back to PNG.
      // We must check the actual blob type to set the correct extension.
      const ext = blob.type === 'image/webp' ? '.webp' : '.png'
      const fileName = file.name.replace(/\.[^/.]+$/, ext)
      
      const fileKey = await uploadFile('article', blob, fileName)
      
      if (fileKey.data) {
        const [source, key] = fileKey.data.split('/')
        const markdownLink = `![](/api/oss/${source}_${key})`
        
        if (placeholder) {
          // Replace placeholder with actual link
          textareaValue = textareaValue.replace(placeholder, markdownLink)
        } else {
          // Append to end if no placeholder
          textareaValue = `${textareaValue}\n${markdownLink}`
        }
        success = 'Uploaded Successfully'
        
        // Auto clear success message
        setTimeout(() => {
           if (success === 'Uploaded Successfully') success = ''
        }, 3000)
      } else if (fileKey.error) {
        throw new Error(fileKey.error.message)
      }
    } catch(e: any) {
      formError = e.message
      if (placeholder) {
        // Remove placeholder on error
        textareaValue = textareaValue.replace(placeholder, '')
      }
    }
  }

  async function upload(e: Event) {
    e.preventDefault()
    const files = await pickFileWithFileInput()
    if (files.length > 0) {
      await processFileUpload(files[0])
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const files = getImagesFromClipboard(e)
    if (files.length > 0) {
      e.preventDefault()
      const textarea = e.target as HTMLTextAreaElement
      const startPos = textarea.selectionStart
      
      files.forEach(file => {
        const placeholder = generatePlaceholder(file.name)
        textareaValue = insertTextAtPosition(textareaValue, placeholder, startPos)
        
        // Start upload process
        processFileUpload(file, placeholder)
      })
    }
  }

  function handleDrop(e: DragEvent) {
    const files = getImagesFromDrop(e)
    if (files.length > 0) {
      e.preventDefault()
      const textarea = e.target as HTMLTextAreaElement
      // Note: Drop position calculation is complex, here we simplify to inserting at current cursor or end
      // For better UX, we could use document.caretPositionFromPoint but it's not standard
      // So we fallback to selectionStart (where user clicked before drag) or simply append
      const startPos = textarea.selectionStart || textareaValue.length
      
      files.forEach(file => {
        const placeholder = generatePlaceholder(file.name)
        textareaValue = insertTextAtPosition(textareaValue, placeholder, startPos)
        processFileUpload(file, placeholder)
      })
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

  function back(e: Event) {
    e.preventDefault()
    if (isPreset) return
    
    const target = source === MarkdownSource.Page ? '/dashboard/pages' : '/dashboard/posts'
    window.location.href = target
  }

  async function save(e: Event) {
    e.preventDefault()

    const previewEl = document.getElementById('preview-md')
    const outgoingLinkEls: HTMLAnchorElement[] = Array.from(previewEl?.querySelectorAll('a.outgoing-link') || [])
    const tagEls: HTMLSpanElement[] = Array.from(previewEl?.querySelectorAll('span.tag') || [])

    const formData = new FormData(editorForm)
    formData.append('outgoingLinks', JSON.stringify(outgoingLinkEls.map(i => ({
      subject: i.textContent,
      link: i.dataset.link
    })).filter(i => !!i.link)))
    
    const contentTags = tagEls.map(el => el.getAttribute('data-tag')).filter(Boolean) as string[];
    
    formData.append('tags', contentTags.join(','))

    if (source === MarkdownSource.Post) {
      const oldLink = markdown.link
      const newLink = formData.get('link') as string
      const refs = allPosts.map(p => {
        const outgoing = parseJson<DoubleLinkPluginOptions['allPostLinks']>(p.outgoing_links || null) || []
        return { ...p, outgoing_links: outgoing}
      }).filter(p => {
        return p.outgoing_links.some(i => i.link === oldLink)
      })
      if (refs.length) {
        await actions.db.markdown.updateRefs(
          refs.map(
            ref => ({ 
              id: ref.id,
              outgoingLinks: ref.outgoing_links.map(i => ({ ...i, link: i.link === oldLink ? newLink : i.link })) 
            })
          )
        )
      }
    }

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

      setTimeout(() => {
        success = ''
      }, 3000)
    }
  }
</script>

<div class="w-full flex-1 flex flex-col pt-5">
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
            class="icon !text-[--koala-editor-text]"
            onclick={closeDeleteConfirm}
          >
            <X size={20} />
          </button>
          <form method="POST" action={actions.form.remove} class="inline">
            <input type="hidden" name="id" value={markdown.id} />
            <input type="hidden" name="link" value={markdown.link} />
            <input type="hidden" name="_action" value="delete" />
            <button
              type="submit"
              class="icon !text-[--koala-editor-text] !text-[--koala-error-text]"
            >
              <Trash2 size={20} />
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
        {#if !isPreset}
          <button class="icon" onclick={back}><ArrowLeft size={20} /></button>
        {/if}
        <button id="save" class="icon" onclick={save}><Save size={20} /></button>
        <button class="icon" onclick={toggleToolbar}><Ellipsis size={20} /></button>
      </div>
    </div>
    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="id" value={markdown.id} />

    {#if toolbarVisible}
    <div class="flex flex-col gap-2 my-2 py-2 bg-[--koala-bg] rounded border border-[--koala-border]">
      <div class="flex items-center gap-3">
        <button id="upload" class="icon" onclick={upload}><Upload size={20} /></button>
        <button id="preview" class="icon" onclick={preview}>
          {#if showPreview}
            <SquarePen size={20} />
          {:else}
            <Eye size={20} />
          {/if}
        </button>
        {#if !isPreset && markdown.id > 0}
          <button
            type="button"
            class="icon !text-[--koala-error-text]"
            onclick={openDeleteConfirm}
          >
            <Trash2 size={20} />
          </button>
          <button
            type="button"
            class="icon"
            onclick={copyLink}
          >
            {#if copyBtnText === 'Copied'}
              <Check size={20} />
            {:else}
              <Link size={20} />
            {/if}
          </button>
        {/if}
      </div>
      
    </div>
    {/if}

    <div class="flex mb-2 {showPreview ? 'hidden' : ''} flex-col sm:flex-row sm:items-center">
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
      onpaste={handlePaste}
      ondrop={handleDrop}
    ></textarea>
    <article id="preview-md" class="w-full {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>

  </form>
</div>
