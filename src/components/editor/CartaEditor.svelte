<script lang="ts">
  import { getSourceFromLink, getMarkdownSourceKey } from '@/db'
  import type { Markdown } from '@/db/types'
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import { parseJson } from '@/lib/utils/parse-json'
  import type { DoubleLinkPluginOptions } from '@/lib/markdown'
  import { Save, Upload, Trash2, Link, Check, X, ArrowLeft, Menu, Lock, LockOpen } from '@lucide/svelte'
  import { editorStore, upsertItem, popHistory, setCurrentMarkdown, setDraft, removeDraft, drafts, notify, toggleSidebar } from './store.svelte'
  import { cartaStore } from './carta-store.svelte'
  import { MarkdownEditor } from 'carta-md'
  import '@cartamd/plugin-code/default.css';
  import '@cartamd/plugin-slash/default.css';
  import { md } from '@/lib/markdown'

  interface Props {
    markdown: Markdown
    onSave?: (m: Markdown) => void
  }

  let editorForm: HTMLFormElement
  let { markdown, onSave }: Props = $props()

  let subjectValue = $state(markdown.subject ?? '')
  let textareaValue = $state(markdown.content ?? '')
  let privateValue = $state(markdown.private ?? false)
  let linkValue = $state(markdown.link ?? '')
  let source = $derived(getSourceFromLink(linkValue))
  let changed = $derived(drafts.has(markdown.link))
  
  let isSaving = $state(false)

  onMount(() => {
      cartaStore.init()
  })

  $effect(() => {
    const rawData = editorStore.items.find(i => i.link === markdown.link)
    if (!rawData) return

    const isDirty = subjectValue !== (rawData.subject ?? '') || textareaValue !== (rawData.content ?? '')
    if (isDirty) {
      setDraft(markdown.link, { ...markdown, subject: subjectValue, content: textareaValue, link: linkValue })
    }
    else {
      removeDraft(markdown.link)
    }
  })

  // Sync state when markdown prop changes
  $effect(() => {
    const data = markdown

    subjectValue = data.subject ?? ''
    textareaValue = data.content ?? ''
    privateValue = data.private ?? false
    linkValue = data.link ?? ''
  })

  // Generate link when subject changed
  let userDefinedLink = false

  function onInputLink(e: Event) {
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

  // Handle hotkeys
  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save(e)
    }
  }

  let copyBtnText = $state('Link')
  function copyLink() {
    const supportClipboard = navigator && 'clipboard' in navigator
    if (supportClipboard) {
      navigator.clipboard.writeText(
        `${window.location.origin}/${markdown.link}`,
      ).then(() => {
        copyBtnText = 'Copied'
        setTimeout(() => {
          copyBtnText = 'Link'
        }, 2000)
      })
    }
  }

  function back(e: Event) {
    e.preventDefault()

    if (editorStore.history.length > 1) {
      const prevLink = editorStore.history[editorStore.history.length - 2]
      const prevItem = editorStore.items.find(i => i.link === prevLink)
      if (prevItem) {
        popHistory() // Confirm pop
        setCurrentMarkdown(prevItem)
        return
      }
    }

    const target = `/dashboard/${getMarkdownSourceKey(source)}`
    window.location.href = target
  }

  function formatError(message: string) {
    const prefix = 'Failed to validate: '
    if (message && message.startsWith(prefix)) {
      try {
        const jsonStr = message.slice(prefix.length)
        const errors = JSON.parse(jsonStr)
        if (Array.isArray(errors)) {
          const fieldMap: Record<string, string> = {
            link: 'File Path',
            subject: 'Title',
            content: 'Content',
            source: 'Source',
            private: 'Visibility',
            id: 'ID',
            outgoingLinks: 'Links',
          }

          return errors.map((err: any) => {
            const field = err.path?.[0]
            const fieldName = field ? (fieldMap[field] || field) : 'Error'
            return `${fieldName}: ${err.message}`
          }).join('\n')
        }
      }
      catch (e) {
        return message
      }
    }
    return message
  }

  async function togglePrivate(e: Event) {
    e.preventDefault()
    const newPrivateValue = !privateValue

    if (markdown.id > 0) {
      const formData = new FormData()
      formData.append('id', markdown.id.toString())
      formData.append('private', newPrivateValue.toString())

      const result = await actions.form.setPrivate(formData)

      if (result.error) {
        notify('error', formatError(result.error.message))
        privateValue = !newPrivateValue // Revert
      }
      else {
        if (result.data?.[0]) {
          const updated = result.data[0]
          // Preserve current draft content when updating store
          const preserved = {
            ...updated,
            subject: subjectValue,
            content: textareaValue,
            link: linkValue,
          }
          upsertItem(preserved)
          setCurrentMarkdown(preserved)
        }
        privateValue = newPrivateValue
      }
    }
  }

  async function save(e: Event) {
    e.preventDefault()
    if (isSaving) return
    isSaving = true

    const mdInstance = await md({ allPostLinks: editorStore.items })
    const html = await mdInstance.render(textareaValue)
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html

    const outgoingLinkEls: HTMLAnchorElement[] = Array.from(tempDiv.querySelectorAll('a.outgoing-link') || [])
    const tagEls: HTMLSpanElement[] = Array.from(tempDiv.querySelectorAll('span.tag') || [])
    
    const formData = new FormData(editorForm)
    formData.append('outgoingLinks', JSON.stringify(outgoingLinkEls.map(i => ({
      subject: i.textContent,
      link: i.dataset.link
    })).filter(i => !!i.link)))
    
    const contentTags = tagEls.map(el => el.getAttribute('data-tag')).filter(Boolean) as string[];
    
    formData.append('tags', contentTags.join(','))
    formData.append('private', String(privateValue))

    const oldLink = markdown.link
    const newLink = formData.get('link') as string
    
    const refs = editorStore.items.map(p => {
      const outgoing = parseJson<DoubleLinkPluginOptions['allPostLinks']>(p.outgoing_links || null) || []
      return { ...p, outgoing_links: outgoing }
    }).filter(p => {
      return p.outgoing_links.some(i => i.link === oldLink)
    })
    
    if (refs.length) {
      await actions.db.markdown.updateRefs(
        refs.map(
          ref => ({
            id: ref.id,
            outgoingLinks: ref.outgoing_links.map(i => ({ ...i, link: i.link === oldLink ? newLink : i.link }))
          }),
        ),
      )
    }

    const result = await actions.form.save(formData)

    if (result.error) {
      notify('error', formatError(result.error.message))
    }
    else {
      notify('success', 'Saved Success', 3000)
      if (result.data?.[0]) {
        markdown = result.data[0]
        onSave?.(markdown)
        upsertItem(markdown)
        removeDraft(oldLink)
      }
    }
    isSaving = false
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="w-full flex-1 flex flex-col pt-5" onkeydown={handleKeydown}>
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[50vw] sm:max-w-md sm:w-full">
        <h3 class="text-xl font-bold mb-4">Confirm</h3>
        <p class="mb-6">Are you sure you want to delete this article? </p>
        <div class="flex justify-end gap-3">
          <button
            class="icon !text-[--koala-editor-text] btn"
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
              class="icon !text-[--koala-editor-text] !text-[--koala-error-text] btn"
            >
              <Trash2 size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <form bind:this={editorForm} method="POST" class="flex-1 flex flex-col overflow-hidden">
    <div class="flex justify-between items-center mb-2 gap-4 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="icon btn"
          onclick={(e) => { e.preventDefault(); toggleSidebar(); }}
        >
          <Menu size={20} />
        </button>
        <button class="icon btn {editorStore.history.length <= 1 ? 'hidden' : ''}" onclick={back}><ArrowLeft size={20} /></button>
      </div>

      <div class="flex-1 max-w-xl mx-auto flex items-center gap-2 bg-[--koala-bg] rounded px-2">
        <input
          id="link-input"
          class="w-full bg-transparent border-none outline-none text-sm text-[--koala-subtext-0] h-8 text-center"
          type="text"
          name="link"
          bind:value={linkValue}
          oninput={onInputLink}
          onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Input Path..."
        />
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="icon btn {markdown.id > 0 ? '' : 'opacity-30 !cursor-not-allowed'}"
          onclick={togglePrivate}
          disabled={!(markdown.id > 0)}
          title={markdown.id > 0 ? (privateValue ? 'Private' : 'Public') : 'Save first to set privacy'}
        >
          {#if privateValue}
            <Lock size={20} />
          {:else}
            <LockOpen size={20} />
          {/if}
        </button>
        <button id="save" class="icon btn {changed ? '!text-[--koala-success-text]' : ''}" onclick={save} disabled={isSaving}>
            {#if isSaving}
                 <!-- Loading spinner placeholder -->
                 ...
            {:else}
                <Save size={20} />
            {/if}
        </button>

        {#if markdown.id > 0}
          <button
            type="button"
            class="icon !text-[--koala-error-text] btn"
            onclick={openDeleteConfirm}
            title="Delete"
          >
            <Trash2 size={20} />
          </button>
          <button
            type="button"
            class="icon btn"
            onclick={copyLink}
            title="Copy Link"
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

    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="id" value={markdown.id} />
    
    <input
      id="subject-input"
      type="text"
      name="subject"
      class="text-[--koala-text] w-full text-xl font-bold bg-transparent border-none outline-none border-b border-[--koala-border] pb-2 placeholder-[--koala-editor-placeholder]"
      bind:value={subjectValue}
      placeholder="Title"
    />
    
    <!-- Carta Editor Container -->
    <div class="flex-1 overflow-hidden relative carta-container">
        {#if cartaStore.carta}
            <MarkdownEditor carta={cartaStore.carta} bind:value={textareaValue} mode="tabs" />
        {/if}
    </div>
    
    <!-- Hidden textarea to ensure form submission includes content if standard submit used, though we use fetch -->
    <textarea name="content" class="hidden" bind:value={textareaValue}></textarea>

  </form>
</div>

<style>
:global(.carta-font-code) {
  caret-color: var(--koala-editor-text);
  font-size: 1.1rem;
}
:global(.carta-wrapper) {
  height: calc(100vh - 200px);
  overflow: auto;
}
</style>
