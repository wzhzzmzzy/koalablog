<script lang="ts">
  import type { Markdown } from '@/db/types'
  import { isPresetSource, MarkdownSource, type PostOrPage } from '@/db'
  import { linkGenerator } from '@/db/markdown'
  import { marked } from 'marked'
  import { useMediaQuery } from '@/lib/utils/media-query';
  import { onMount } from 'svelte';

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
  async function refreshPreview() {
    let previewMd = textareaValue
    if (subjectValue && !isPreset) {
      previewMd = `# ${subjectValue}\n\n${textareaValue}`
    }
    previewHtml = await marked(previewMd)
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

</script>

{#snippet collapse(name: string, show: boolean)}
  <button class="bg-white outline-none border-none [writing-mode:vertical-lr] flex items-center cursor-pointer" onclick={() => showPreview = show}>
    <div class="i-tabler:arrow-badge-{show ? 'left' : 'right'}-filled text-xl"></div>
    <div><b>{name}</b></div>
  </button>
{/snippet}

<div class="w-full">
  <form method="POST">
    <div class="flex flex-col">
      <button id="save" class="w-12">Save</button>
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

        <div class="md:flex-1 {showPreview && 'flex-1'}">
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

