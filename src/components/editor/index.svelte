<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { useMediaQuery } from '@/lib/utils/media-query';
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

  let fullPreview = $state(true)
  let showPreview = $state(false)
  const { getSnapshot } = useMediaQuery('md', (e) => fullPreview = e.matches)
  onMount(() => fullPreview = getSnapshot())

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
</script>

{#snippet collapse(name: string, show: boolean)}
  <button class="bg-white outline-none border-none [writing-mode:vertical-lr] flex items-center cursor-pointer" onclick={() => showPreview = show}>
    <div class="i-tabler:arrow-badge-{show ? 'left' : 'right'}-filled text-xl"></div>
    <div><b>{name}</b></div>
  </button>
{/snippet}

<div class="w-full">
  {#if uploadError}
    <p class="error">{uploadError}</p>
  {/if}

  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">Confirm</h3>
        <p class="mb-6">Are you sure you want to delete this article? </p>
        <div class="flex justify-end gap-3">
          <button 
            class="px-4 py-2 border border-gray-300 rounded-lg" 
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
              class="px-4 py-2 bg-red-600 text-white rounded-lg"
            >
              删除
            </button>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <form method="POST" action={actions.form.save}>
    <input type="hidden" name="source" value={source} />
    <div class="flex flex-col">
      <div class="flex items-center gap-3">
        <button id="save" class="w-12">Save</button>
        <button id="upload" class="w-18" onclick={upload}>Upload</button>
        {#if !isPreset && markdown.id > 0}
          <button 
            type="button" 
            class="bg-red-600 text-white px-3 py-1 rounded-lg" 
            onclick={openDeleteConfirm}
          >
            Delete
          </button>
        {/if}
      </div>
      <input type="hidden" name="id" value={markdown.id} />

      <div class="grid grid-cols-2 auto-cols-[minmax(0,2fr)] gap-3 h-screen">
        <div>
          {#if !showPreview || fullPreview}
            <input
              id="subject-input"
              type={isPreset ? 'hidden' : 'text'}
              name="subject"
              class="mt-3 w-50"
              bind:value={subjectValue}
              placeholder="Title"
            />
            <input
              id="link-input"
              type={isPreset ? 'hidden' : 'text'}
              name="link"
              class="mt-3 w-50"
              bind:value={linkValue}
              oninput={onInputLink}
              placeholder="Link"
            />
            <textarea 
              class="p-1 text-sm w-full h-[calc(100vh-50px)] box-border mt-3" 
              name="content" 
              bind:value={textareaValue}
            ></textarea>
          {:else}
            {@render collapse('Editor', false)}
          {/if}
        </div>

        <div class="h-[calc(100vh-50px)] overflow-y-auto">
          {#if showPreview || fullPreview}
            <article id="preview-md" class="w-full">
              {@html previewHtml}
            </article>
          {:else}
            {@render collapse('Preview', true)}
          {/if}
        </div>
      </div>
    </div>
  </form>
</div>
