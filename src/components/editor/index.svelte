<script lang="ts">
  import { getSourceFromLink, getMarkdownSourceKey } from '@/db'
  import type { Markdown } from '@/db/types';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { convertToWebP, pickFileWithFileInput, uploadFile } from '@/lib/services/file-reader';
  import { parseJson } from '@/lib/utils/parse-json';
  import type { DoubleLinkPluginOptions } from '@/lib/markdown/double-link-plugin';
  import { Save, Ellipsis, Upload, Eye, SquarePen, Trash2, Link, Check, X, ArrowLeft, Menu, Lock, LockOpen, House, RotateCcw } from '@lucide/svelte';
  import { generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition } from './utils';
  import { editorStore, upsertItem, popHistory, setCurrentMarkdown, setDraft, removeDraft, drafts, notify, toggleSidebar } from './store.svelte';

  interface Props {
			markdown: Markdown;
	    onSave?: (m: Markdown) => void;
	    onUpdate?: (m: Markdown) => void;
	    onPurge?: (id: number) => void;
		}

  let editorForm: HTMLFormElement
  let { markdown, onSave, onUpdate, onPurge }: Props = $props()

  let subjectValue = $state(markdown.subject ?? '')
  let textareaValue = $state(markdown.content ?? '')
  let privateValue = $state(markdown.private ?? false)
  let previewHtml = $state('')
  let linkValue = $state(markdown.link ?? '')
  let source = $derived(getSourceFromLink(linkValue))
  let trashed = $derived(Boolean(markdown.deletedAt))
  let changed = $derived(!trashed && drafts.has(markdown.link))

  $effect(() => {
    if (trashed) {
      return
    }

    const rawData = editorStore.items.find(i => markdown.id > 0 ? i.id === markdown.id : i.link === markdown.link)
    if (!rawData) return;

    const isDirty = subjectValue !== (rawData.subject ?? '') || textareaValue !== (rawData.content ?? '')
    if (isDirty) {
      setDraft(markdown.link, { ...markdown, subject: subjectValue, content: textareaValue, link: linkValue })
    } else {
      removeDraft(markdown.link)
    }
  })

  // Sync state when markdown prop changes
  $effect(() => {
    const data = markdown

    subjectValue = data.subject ?? '';
    textareaValue = data.content ?? '';
    privateValue = data.private ?? false;
    linkValue = data.link ?? '';
  });

  // Generate preview when subject / content changed
  $effect(() => {
     refreshPreview()
  })

  $effect(() => {
    document.title = `[Editor] ${subjectValue || 'New File'}`
  })

  let mdInstance: MarkdownIt | null = null
  
  onMount(async () => {
    mdInstance = await md({ allPostLinks: editorStore.items.filter(item => !item.deletedAt) })
    refreshPreview()

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (!trashed && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save(e)
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  })

  // Watch for store changes to update markdown-it instance
  $effect(() => {
      if (mdInstance && editorStore.items.length > 0) {
          // Re-initialize markdown-it if items change (for link resolution)
          // Note: ideally we would just update the context, but re-init is safer for now
          md({ allPostLinks: editorStore.items.filter(item => !item.deletedAt) }).then(inst => {
              mdInstance = inst;
              refreshPreview();
          });
      }
  });

  async function refreshPreview() {
    let previewMd = textareaValue
    if (subjectValue) {
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

  function onInputLink(e: Event) {
    userDefinedLink = true
  }

  // Delete confirm popover
  let showDeleteConfirm = $state(false)
  let showPurgeConfirm = $state(false)
  let restoreConflict = $state<{ suggestedLink: string; suggestedSubject: string } | null>(null)
  
  function openDeleteConfirm() {
    showDeleteConfirm = true
  }
  
  function closeDeleteConfirm() {
    showDeleteConfirm = false
  }

  async function trashDocument() {
    const result = await actions.db.markdown.trash({ id: markdown.id })
    if (result.error || !result.data || result.data.status !== 'trashed') {
      notify('error', result.error?.message || 'Document was not found')
      return
    }

    closeDeleteConfirm()
    removeDraft(markdown.link)
    markdown = result.data.document
    onUpdate?.(markdown)
    notify('success', 'Moved to recycle bin', 3000)
  }

  async function restoreDocument(renameOnConflict = false) {
    const result = await actions.db.markdown.restore({ id: markdown.id, renameOnConflict })
    if (result.error || !result.data) {
      notify('error', result.error?.message || 'Restore failed')
      return
    }
    if (result.data.status === 'conflict') {
      restoreConflict = {
        suggestedLink: result.data.suggestedLink,
        suggestedSubject: result.data.suggestedSubject,
      }
      return
    }
    if (result.data.status !== 'restored') {
      notify('error', 'Document was not found')
      return
    }

    restoreConflict = null
    markdown = result.data.document
    onUpdate?.(markdown)
    notify('success', `Restored as ${markdown.link}`, 3000)
  }

  async function purgeDocument() {
    const id = markdown.id
    const result = await actions.db.markdown.purge({ id })
    if (result.error || result.data?.status !== 'purged') {
      notify('error', result.error?.message || 'Document was not found')
      return
    }

    showPurgeConfirm = false
    onPurge?.(id)
    notify('success', 'Permanently deleted', 3000)
  }

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
        notify('success', 'Uploaded Successfully', 3000)
      } else if (fileKey.error) {
        throw new Error(fileKey.error.message)
      }
    } catch(e: any) {
      notify('error', e.message)
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

  function backToDashboard(e: Event) {
    e.preventDefault()

    window.location.href = '/dashboard'
  }

  function back(e: Event) {
    e.preventDefault()
    
    if (editorStore.history.length > 1) {
        const prevLink = editorStore.history[editorStore.history.length - 2];
        const prevItem = editorStore.items.find(i => !i.deletedAt && i.link === prevLink);
        if (prevItem) {
            popHistory(); // Confirm pop
            setCurrentMarkdown(prevItem);
            return;
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
            outgoingLinks: 'Links'
          }
          
          return errors.map((err: any) => {
            const field = err.path?.[0]
            const fieldName = field ? (fieldMap[field] || field) : 'Error'
            return `${fieldName}: ${err.message}`
          }).join('\n')
        }
      } catch (e) {
        return message
      }
    }
    return message
  }

  async function togglePrivate(e: Event) {
    e.preventDefault()
    if (trashed) return
    const newPrivateValue = !privateValue

    if (markdown.id > 0) {
      const formData = new FormData()
      formData.append('id', markdown.id.toString())
      formData.append('private', newPrivateValue.toString())
      
      const result = await actions.form.setPrivate(formData)
      
      if (result.error) {
        notify('error', formatError(result.error.message))
        privateValue = !newPrivateValue // Revert
      } else {
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
    if (trashed) return

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
    formData.append('private', String(privateValue));

    const oldLink = markdown.link
    const newLink = formData.get('link') as string
    const refs = editorStore.items.map(p => {
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

    const result = await actions.form.save(formData)

    if (result.error) {
      notify('error', formatError(result.error.message))
    } else {
      notify('success', 'Saved Success', 3000)
      if (result.data?.[0]) {
        markdown = result.data[0]
        onSave?.(markdown)
        upsertItem(markdown)
        removeDraft(oldLink)
      }
    }
  }
</script>

<div class="w-full flex-1 flex flex-col pt-5">
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[50vw] sm:max-w-md sm:w-full">
        <h3 class="text-xl font-bold mb-4">Confirm</h3>
        <p class="mb-6">Move this document to the recycle bin?</p>
        <div class="flex justify-end gap-3">
          <button
            class="icon !text-[--koala-editor-text] btn"
            onclick={closeDeleteConfirm}
          >
            <X size={20} />
          </button>
          <button
            type="button"
            class="icon !text-[--koala-error-text] btn"
            onclick={trashDocument}
            title="Move to recycle bin"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showPurgeConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[90vw] sm:max-w-md sm:w-full">
        <h3 class="text-xl font-bold mb-4">Permanently delete?</h3>
        <p class="mb-6">This cannot be undone. Other documents with the same name will not be affected.</p>
        <div class="flex justify-end gap-3">
          <button type="button" class="icon btn" onclick={() => showPurgeConfirm = false}><X size={20} /></button>
          <button type="button" class="icon !text-[--koala-error-text] btn" onclick={purgeDocument} title="Permanently delete">
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if restoreConflict}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-[--koala-input-bg] px-5 py-2 sm:p-6 rounded-lg max-w-[90vw] sm:max-w-md sm:w-full">
        <h3 class="text-xl font-bold mb-4">Name already in use</h3>
        <p class="mb-2">Another active document uses this path or title.</p>
        <p class="mb-6 text-sm text-[--koala-subtext-0] break-all">Restore as {restoreConflict.suggestedLink}</p>
        <div class="flex justify-end gap-3">
          <button type="button" class="icon btn" onclick={() => restoreConflict = null}><X size={20} /></button>
          <button type="button" class="btn flex items-center gap-2" onclick={() => restoreDocument(true)}>
            <RotateCcw size={18} />
            <span>Restore renamed</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <form bind:this={editorForm} method="POST" class="flex-1 flex flex-col h-full overflow-hidden">
    <div class="flex justify-between items-center mb-2 gap-4 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <button 
          type="button"
          class="icon btn"
          onclick={(e) => { e.preventDefault(); toggleSidebar(); }}
        >
          <Menu size={20} />
        </button>
        <button 
          type="button"
          class="icon btn"
          onclick={backToDashboard}
        >
          <House size={20} />
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
          readonly={trashed}
        />
      </div>

      <div class="flex items-center gap-1 shrink-0">
        {#if trashed}
          <button type="button" class="icon btn" onclick={() => restoreDocument(false)} title="Restore">
            <RotateCcw size={20} />
          </button>
          <button type="button" class="icon !text-[--koala-error-text] btn" onclick={() => showPurgeConfirm = true} title="Permanently delete">
            <Trash2 size={20} />
          </button>
        {:else}
        <button
          type="button"
          class="icon btn {markdown.id > 0 ? '' : 'opacity-30 !cursor-not-allowed'}"
          onclick={togglePrivate}
          disabled={!(markdown.id > 0)}
          title={markdown.id > 0 ? (privateValue ? "Private" : "Public") : "Save first to set privacy"}
        >
          {#if privateValue}
            <Lock size={20} />
          {:else}
            <LockOpen size={20} />
          {/if}
        </button>
        <button id="save" class="icon btn {changed ? '!text-[--koala-success-text]' : '' }" onclick={save}><Save size={20} /></button>

        <!-- <button class="icon btn" onclick={toggleToolbar}><Ellipsis size={20} /></button> -->

        <button id="upload" class="icon btn" onclick={upload} title="Upload Image"><Upload size={20} /></button>
        <button id="preview" class="icon btn" onclick={preview} title="Toggle Preview">
        {#if showPreview}
            <SquarePen size={20} />
        {:else}
            <Eye size={20} />
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
        {/if}
      </div>
    </div>

    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="id" value={markdown.id} />

    {#if toolbarVisible}
    <div class="flex flex-col gap-2 mb-2 py-2 px-2 bg-[--koala-bg] rounded border border-[--koala-border] shrink-0">
      <div class="flex items-center gap-3 justify-between">
        <div class="flex items-center gap-2">
        </div>
        
        <div class="flex items-center gap-2">
        </div>
      </div>
    </div>
    {/if}

    <input
      id="subject-input"
      type="text"
      name="subject"
      class="text-[--koala-text] {showPreview ? 'hidden' : ''} w-full text-xl font-bold bg-transparent border-none outline-none border-b border-[--koala-border] pb-2 placeholder-[--koala-editor-placeholder]"
      bind:value={subjectValue}
      placeholder="Title"
      readonly={trashed}
    />

    <textarea
      class="text-sm w-full flex-1 box-border bg-transparent border-none outline-none resize-none p-2 {showPreview ? 'hidden' : ''}" 
      name="content" 
      placeholder="Type here..."
      bind:value={textareaValue}
      onpaste={handlePaste}
      ondrop={handleDrop}
      readonly={trashed}
    ></textarea>

    <article id="preview-md" class="w-full flex-1 overflow-y-auto {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>

  </form>
</div>
