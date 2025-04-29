<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { useMediaQuery } from '@/lib/utils/media-query';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
    import type MarkdownIt from 'markdown-it';

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
    if (!userDefinedLink) {
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

  // 删除确认对话框
  let showDeleteConfirm = $state(false)
  
  function openDeleteConfirm() {
    showDeleteConfirm = true
  }
  
  function closeDeleteConfirm() {
    showDeleteConfirm = false
  }
</script>

{#snippet collapse(name: string, show: boolean)}
  <button class="bg-white outline-none border-none [writing-mode:vertical-lr] flex items-center cursor-pointer" onclick={() => showPreview = show}>
    <div class="i-tabler:arrow-badge-{show ? 'left' : 'right'}-filled text-xl"></div>
    <div><b>{name}</b></div>
  </button>
{/snippet}

<div class="w-full">
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">确认删除</h3>
        <p class="mb-6">您确定要删除 "{subjectValue}" 吗？此操作无法撤销。</p>
        <div class="flex justify-end gap-3">
          <button 
            class="px-4 py-2 border border-gray-300 rounded-lg" 
            onclick={closeDeleteConfirm}
          >
            取消
          </button>
          <form method="POST" class="inline">
            <input type="hidden" name="id" value={markdown.id} />
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

  <form method="POST">
    <div class="flex flex-col">
      <div class="flex justify-between items-center">
        <button id="save" class="w-12">Save</button>
        {#if !isPreset && markdown.id > 0}
          <button 
            type="button" 
            class="bg-red-600 text-white px-3 py-1 rounded-lg" 
            onclick={openDeleteConfirm}
          >
            删除
          </button>
        {/if}
      </div>
      <input type="hidden" name="id" value={markdown.id} />

      <div class="flex gap-3">
        <div class="md:flex-1 {!showPreview && 'flex-1'}">
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
            <textarea class="w-full min-h-90 box-border mt-3" name="content" bind:value={textareaValue}></textarea>
          {:else}
            {@render collapse('Editor', false)}
          {/if}
        </div>

        <div class="md:flex-1 md:shrink-0 md:flex {showPreview && 'flex-1'}">
          {#if showPreview || fullPreview}
            <article id="preview-md" class="flex-1">
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
