<script lang="ts">
  import { X, Plus } from '@lucide/svelte';

  interface Props {
    value?: string; // Comma separated tags
    existingTags?: string[]; // All existing tags in the system for autocomplete
    onChange?: (tags: string) => void;
  }

  let { value = '', existingTags = [], onChange }: Props = $props();

  let tags = $state<string[]>(value ? value.split(',').filter(Boolean) : []);
  let inputValue = $state('');
  let showSuggestions = $state(false);
  
  // Filter suggestions based on input
  let suggestions = $derived(
    inputValue 
      ? existingTags
          .filter(t => t.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(t))
          .slice(0, 5)
      : []
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      tags = [...tags, trimmed];
      updateParent();
    }
    inputValue = '';
    showSuggestions = false;
  }

  function removeTag(tagToRemove: string) {
    tags = tags.filter(t => t !== tagToRemove);
    updateParent();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function handleInput(e: Event) {
    // Check for commas in input (e.g. from paste or IME)
    if (inputValue.includes(',') || inputValue.includes('，')) {
      const parts = inputValue.split(/,|，/);
      // If there are multiple parts, the last one is the new input
      // All previous parts are tags to be added
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i]) addTag(parts[i]);
      }
      // Keep the last part as current input (it might be empty if input ended with comma)
      inputValue = parts[parts.length - 1];
    }
  }

  function updateParent() {
    onChange?.(tags.join(','));
  }
</script>

<div class="tags-input-container relative flex flex-wrap items-center gap-2 p-2 border border-[--koala-border] bg-[--koala-input-bg]">
  {#each tags as tag}
    <span class="tag-badge flex items-center gap-1 px-2 py-0.5 rounded text-sm bg-[--koala-tag-bg] text-[--koala-tag-text]">
      {tag}
      <button 
        type="button" 
        class="btn-ghost hover:text-[--koala-error-text] flex items-center justify-center" 
        onclick={() => removeTag(tag)}
      >
        <X size={14} />
      </button>
    </span>
  {/each}
  
  <div class="relative flex-1 min-w-[100px]">
    <input
      type="text"
      bind:value={inputValue}
      onkeydown={handleKeydown}
      oninput={handleInput}
      onfocus={() => showSuggestions = true}
      onblur={() => setTimeout(() => showSuggestions = false, 200)}
      placeholder={tags.length === 0 ? "Add tags..." : ""}
      class="w-full bg-transparent border-none outline-none text-sm p-0 placeholder-opacity-50"
    />
    
    {#if showSuggestions && suggestions.length > 0}
      <div class="absolute top-full left-0 w-full mt-1 bg-[--koala-bg] border border-[--koala-border] rounded shadow-lg z-10 overflow-hidden">
        {#each suggestions as suggestion}
          <button
            type="button"
            class="btn-ghost w-full text-left px-3 py-2 text-sm hover:bg-[--koala-code-bg] transition-colors block"
            onmousedown={() => addTag(suggestion)}
          >
            {suggestion}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Use global variables consistent with the project */
</style>
