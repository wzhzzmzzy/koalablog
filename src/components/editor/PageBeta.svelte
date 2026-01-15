<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromLink, getMarkdownSourceKey } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import EditorByteMD from './EditorByteMD.svelte';
  import Notification from './Notification.svelte';
  import { editorStore, setItems, setCurrentMarkdown, upsertItem, pushHistory, popHistory, updateLastHistory, drafts, toggleSidebar, setShowSidebar, useEditorPersistence, SIDEBAR_STORAGE_KEY, setDraft, removeDraft, notify } from './store.svelte';
  import { Save, Lock, LockOpen, Menu, ArrowLeft } from '@lucide/svelte';

  interface Props {
    initialMarkdown: Markdown;
    initialItems?: Markdown[] | null;
    isMobile?: boolean;
  }

  let { initialMarkdown, initialItems = null, isMobile = false }: Props = $props();

  // Store Init
  useEditorPersistence();
  if (initialItems) setItems(initialItems);
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_STORAGE_KEY) === null) {
    setShowSidebar(!isMobile);
  } else if (isMobile) {
    setShowSidebar(false);
  }
  pushHistory(initialMarkdown.link);
  setCurrentMarkdown(initialMarkdown);

  $effect(() => {
    if (editorStore.currentMarkdown) {
      const url = new URL(window.location.href);
      const currentLink = url.searchParams.get('link');
      const currentId = url.searchParams.get('id');
      if (currentLink !== editorStore.currentMarkdown.link || currentId) {
        url.searchParams.set('link', editorStore.currentMarkdown.link);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);
      }
    }
  });

  // State for current editor
  let currentMd = $derived(editorStore.currentMarkdown || initialMarkdown);
  let subjectValue = $state('');
  let contentValue = $state('');
  let linkValue = $state('');
  let privateValue = $state(false);

  // Sync state with store
  $effect(() => {
     if (currentMd) {
        subjectValue = currentMd.subject ?? '';
        contentValue = currentMd.content ?? '';
        linkValue = currentMd.link ?? '';
        privateValue = currentMd.private ?? false;
     }
  });

  // Draft handling
  $effect(() => {
    const rawData = editorStore.items.find(i => i.link === currentMd.link);
    if (!rawData) return;
    const isDirty = subjectValue !== (rawData.subject ?? '') || contentValue !== (rawData.content ?? '');
    
    if (isDirty) {
       setDraft(currentMd.link, { ...currentMd, subject: subjectValue, content: contentValue, link: linkValue });
    } else {
       removeDraft(currentMd.link);
    }
  });

  let changed = $derived(drafts.has(currentMd.link));

  function handleSelect(m: Markdown) {
    if (m.link) pushHistory(m.link);
    if (drafts.has(m.link)) {
      setCurrentMarkdown(drafts.get(m.link)!);
    } else {
      setCurrentMarkdown(m);
    }
    if (window.innerWidth < 768) setShowSidebar(false);
  }

  async function createNew(prefix: string) {
     const targetSource = getSourceFromLink(prefix);
     const newMd = initMarkdown(targetSource);
     
     if (targetSource === MarkdownSource.Memo) {
        const result = await actions.db.markdown.getNewMemoSubject();
        if (result.data) {
           newMd.subject = result.data;
           newMd.link = `${prefix}${result.data}`;
           newMd.private = true;
        } else if (result.error) {
           console.error('Error fetching memo subject', result.error);
           newMd.link = prefix;
        }
     } else {
        let baseName = 'unnamed';
        let counter = 0;
        let candidate = `${prefix}${baseName}`;
        const exists = (link: string) => editorStore.items.some(i => i.link === link);
        while(exists(candidate)) {
           counter++;
           candidate = `${prefix}${baseName}-${counter}`;
        }
        newMd.link = candidate;
     }
     setCurrentMarkdown(newMd);
  }
  
  // Save Logic
  async function save() {
      const formData = new FormData();
      formData.append('id', currentMd.id.toString());
      formData.append('subject', subjectValue);
      formData.append('content', contentValue);
      formData.append('link', linkValue);
      formData.append('private', String(privateValue));
      formData.append('source', String(getSourceFromLink(linkValue)));

      const result = await actions.form.save(formData);
      if (result.error) {
          notify('error', result.error.message);
      } else {
          notify('success', 'Saved Successfully', 3000);
          if (result.data?.[0]) {
              const saved = result.data[0];
              upsertItem(saved);
              setCurrentMarkdown(saved);
              removeDraft(saved.link);
          }
      }
  }

  function back() {
    if (editorStore.history.length > 1) {
        const prevLink = editorStore.history[editorStore.history.length - 2];
        const prevItem = editorStore.items.find(i => i.link === prevLink);
        if (prevItem) {
            popHistory(); 
            setCurrentMarkdown(prevItem);
            return;
        }
    }
    const source = getSourceFromLink(linkValue);
    const target = `/dashboard/${getMarkdownSourceKey(source)}`
    window.location.href = target
  }
</script>

<div class="flex h-screen w-full overflow-hidden bg-[--koala-bg] text-[--koala-text]">
  <Notification />
  
  <div class="{editorStore.showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out border-r border-[--koala-border] flex flex-col shrink-0 overflow-hidden">
     <div class="flex-1 overflow-hidden pt-5">
        <Sidebar currentId={currentMd?.id || 0} onSelect={handleSelect} onCreate={createNew} />
     </div>
  </div>

  <div class="flex-1 flex flex-col min-w-0 h-full">
     <div class="flex items-center justify-between p-2 border-b border-[--koala-border] shrink-0">
        <div class="flex items-center gap-2">
           <button class="icon btn" onclick={() => toggleSidebar()}>
              <Menu size={20} />
           </button>
           <button class="icon btn {editorStore.history.length <= 1 ? 'hidden' : ''}" onclick={back}>
             <ArrowLeft size={20} />
           </button>
           <input 
              type="text" 
              bind:value={subjectValue}
              placeholder="Title"
              class="bg-transparent border-none outline-none font-bold text-lg w-64 text-[--koala-text] placeholder-[--koala-editor-placeholder]"
           />
        </div>
        
        <div class="flex items-center gap-2">
            <input 
              type="text" 
              bind:value={linkValue}
              placeholder="Path..."
              class="bg-transparent border-none outline-none text-sm text-[--koala-subtext-0] text-right w-48"
           />
           
           <button 
              class="icon btn {currentMd.id > 0 ? '' : 'opacity-30 !cursor-not-allowed'}"
              onclick={() => { if (currentMd.id > 0) privateValue = !privateValue; }}
              disabled={!(currentMd.id > 0)}
              title={currentMd.id > 0 ? (privateValue ? "Private" : "Public") : "Save first to set privacy"}
           >
              {#if privateValue} <Lock size={20} /> {:else} <LockOpen size={20} /> {/if}
           </button>
           
           <button 
              class="icon btn {changed ? '!text-[--koala-success-text]' : ''}" 
              onclick={save}
           >
              <Save size={20} />
           </button>
        </div>
     </div>

     <div class="flex-1 overflow-hidden relative">
        <EditorByteMD 
           value={contentValue} 
           onChange={(v) => contentValue = v} 
        />
     </div>
  </div>
</div>

<style>
  .btn {
     @apply p-2 rounded hover:bg-[--koala-hover-block] transition-colors cursor-pointer flex items-center justify-center text-[--koala-editor-text];
  }
  .icon {
    color: var(--koala-editor-text);
  }
</style>
