<script lang="ts">
  import type { Markdown } from '@/db/types';
  import { Plus, ChevronRight, ChevronDown, Folder, FileText } from '@lucide/svelte';
  import { editorStore } from './store.svelte';

  interface Props {
    onSelect: (m: Markdown) => void;
    onCreate: (prefix: string) => void;
    currentId: number;
  }

  let { onSelect, onCreate, currentId }: Props = $props();

  type TreeNode = {
    name: string;
    fullPath: string;
    children: Record<string, TreeNode>;
    items: Markdown[];
  };

  const tree = $derived.by(() => {
    const root: TreeNode = { name: '', fullPath: '', children: {}, items: [] };

    const sortedItems = [...editorStore.items].sort((a, b) => {
      const linkCompare = a.link.localeCompare(b.link);
      if (linkCompare !== 0) return linkCompare;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    for (const item of sortedItems) {
      const parts = item.link.split('/');
      const fileName = parts.pop() || ''; // remove filename
      let currentNode = root;

      // Navigate/Build tree for folders
      let currentPath = '';
      for (const part of parts) {
        currentPath += part + '/';
        if (!currentNode.children[part]) {
          currentNode.children[part] = {
            name: part,
            fullPath: currentPath,
            children: {},
            items: []
          };
        }
        currentNode = currentNode.children[part];
      }
      
      currentNode.items.push(item);
    }
    return root;
  });

  // Folder expansion state
  let expandedFolders = $state<Record<string, boolean>>({});

  function toggleFolder(path: string) {
    expandedFolders[path] = !expandedFolders[path];
  }

  // Auto-expand current item's path
  $effect(() => {
     if (currentId) {
         const currentItem = editorStore.items.find(i => i.id === currentId);
         if (currentItem) {
             const parts = currentItem.link.split('/');
             parts.pop(); // remove filename
             let path = '';
             for (const part of parts) {
                 path += part + '/';
                 if (expandedFolders[path] === undefined) {
                      expandedFolders[path] = true;
                 }
             }
         }
     }
  });

  function formatDate(date: Date | string) {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  function getSnippet(content: string | null | undefined) {
    if (!content) return '';
    return content.slice(0, 30) + (content.length > 30 ? '...' : '');
  }
</script>

{#snippet fileItem(item: Markdown)}
  <button
    class="outline-none border-none w-full text-left p-2 hover:bg-[--koala-hover-block] transition-colors
           {item.id === currentId ? 'bg-[--koala-focusing-block]' : 'bg-transparent'}
           relative flex items-center gap-1.5 rounded"
    onclick={() => onSelect(item)}
  >
      <FileText size={14} class="opacity-70 shrink-0 text-[--koala-text]" />
      <span class="truncate text-sm text-[--koala-text]">{item.link.split('/').pop() || item.link}.md</span>
  </button>
{/snippet}

{#snippet folderNode(node: TreeNode)}
  <div>
    {#if node.name}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div 
          class="flex items-center justify-between group cursor-pointer select-none p-2"
          onclick={() => toggleFolder(node.fullPath)}
          aria-roledescription="button"
        >
            <div class="flex items-center gap-1.5 text-sm font-medium text-[--koala-subtext-0]">
                {#if expandedFolders[node.fullPath]}
                    <ChevronDown size={14} />
                {:else}
                    <ChevronRight size={14} />
                {/if}
                <span>{node.name}</span>
            </div>
            <button 
                class="outline-none border-none bg-transparent p-0.5 rounded cursor-pointer" 
                onclick={(e) => { e.stopPropagation(); onCreate(node.fullPath); }}
                title="Create new file in {node.name}"
            >
                <Plus size={14} class="text-[--koala-text]" />
            </button>
        </div>
    {/if}

    {#if !node.name || expandedFolders[node.fullPath]}
        <div class="{node.name ? 'border-l border-[--koala-border-subtle] ml-2 pl-2' : ''}">
            {#each Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
                {@render folderNode(child)}
            {/each}
            {#each node.items as item}
                {@render fileItem(item)}
            {/each}
        </div>
    {/if}
  </div>
{/snippet}


<div class="h-full flex flex-col w-full overflow-y-auto">
  {#if editorStore.items.length === 0 && !editorStore.loading}
    <div class="p-4 text-center text-[--koala-subtext-0] text-sm">No files found.</div>
  {:else}
      {#each Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
            {@render folderNode(child)}
      {/each}
      {#each tree.items as item}
            {@render fileItem(item)}
      {/each}
  {/if}

  <button
    class="outline-none border-none w-full text-left p-2 hover:bg-[--koala-hover-block] transition-colors
           bg-transparent relative flex items-center gap-1.5 rounded opacity-60 italic shrink-0"
    onclick={() => onCreate('')}
  >
      <Plus size={14} class="shrink-0 text-[--koala-text]" />
      <span class="truncate text-sm text-[--koala-text]">New file...</span>
  </button>
</div>
