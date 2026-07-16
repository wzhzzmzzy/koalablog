<script lang="ts">
  import { getSourceFromLink, getMarkdownSourceKey } from '@/db'
  import type { Markdown } from '@/db/types';
  import { onMount } from 'svelte';
  import { md } from '@/lib/markdown';
  import type MarkdownIt from 'markdown-it';
  import { actions } from 'astro:actions';
  import { pickFileWithFileInput } from '@/lib/services/file-reader';
  import { Save, Upload, Eye, SquarePen, Link, Check, ArrowLeft, Menu, Lock, LockOpen, House } from '@lucide/svelte';
  import DocumentLifecycle from './DocumentLifecycle.svelte';
  import { changedOutgoingLinkRefs, findPreviousActiveDocument, formatActionError, generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition, uploadEditorImage } from './utils';
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

  $effect(() => {
    const data = markdown

    subjectValue = data.subject ?? '';
    textareaValue = data.content ?? '';
    privateValue = data.private ?? false;
    linkValue = data.link ?? '';
  });

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

  $effect(() => {
      if (mdInstance && editorStore.items.length > 0) {
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

  async function processFileUpload(file: File, placeholder?: string) {
    try {
      const markdownLink = await uploadEditorImage(file)
      textareaValue = placeholder
        ? textareaValue.replace(placeholder, markdownLink)
        : `${textareaValue}\n${markdownLink}`
      notify('success', 'Uploaded Successfully', 3000)
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
    if (trashed) return
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
    if (trashed) return
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

  function backToDashboard(e: Event) {
    e.preventDefault()

    window.location.href = '/dashboard'
  }

  function back(e: Event) {
    e.preventDefault()
    
    if (editorStore.history.length > 1) {
      const prevItem = findPreviousActiveDocument(editorStore.history, editorStore.items);
        if (prevItem) {
            popHistory(); // Confirm pop
            setCurrentMarkdown(prevItem);
            return;
        }
    }

    const target = `/dashboard/${getMarkdownSourceKey(source)}`
    window.location.href = target
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
        notify('error', formatActionError(result.error.message))
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
    const refs = changedOutgoingLinkRefs(editorStore.items, oldLink, newLink)
    if (refs.length) {
      await actions.db.markdown.updateRefs(refs)
    }

    const result = await actions.form.save(formData)

    if (result.error) {
      notify('error', formatActionError(result.error.message))
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
          onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Input Path..."
          readonly={trashed}
        />
      </div>

      <div class="flex items-center gap-1 shrink-0">
        {#if trashed}
          <DocumentLifecycle {markdown} {onUpdate} {onPurge} />
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

        <button id="upload" class="icon btn" onclick={upload} title="Upload Image"><Upload size={20} /></button>
        <button id="preview" class="icon btn" onclick={preview} title="Toggle Preview">
        {#if showPreview}
            <SquarePen size={20} />
        {:else}
            <Eye size={20} />
        {/if}
        </button>
        {#if markdown.id > 0}
        <DocumentLifecycle {markdown} {onUpdate} {onPurge} />
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
