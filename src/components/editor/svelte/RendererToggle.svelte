<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';

  interface Props {
    value: RendererMode;
    disabled: boolean;
    onChange: (renderer: RendererMode) => void;
  }

  let { value, disabled, onChange }: Props = $props();
  const disabledReason = 'Renderer cannot be changed for a recycled File';
  const options = [
    { value: 'markdown', label: 'Markdown' },
    { value: 'svelte', label: 'Svelte' },
  ] as const;

  function selectRenderer(renderer: RendererMode) {
    if (!disabled && renderer !== value)
      onChange(renderer);
  }
</script>

<fieldset
  role="radiogroup"
  aria-label="Renderer Mode"
  class="m-0 flex h-8 items-center gap-1 border-0 p-0 text-xs text-[--koala-subtext-0]"
>
  <legend class="sr-only">Renderer Mode</legend>
  {#each options as option}
    <label
      class="flex h-8 items-center gap-1 rounded px-1.5 hover:bg-[--koala-icon-btn-bg] {disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}"
    >
      <input
        type="radio"
        name="renderer-mode"
        value={option.value}
        checked={value === option.value}
        disabled={disabled}
        title={disabled ? disabledReason : option.label}
        aria-describedby={disabled ? 'renderer-mode-disabled-reason' : undefined}
        class="m-0 h-3.5 w-3.5 accent-[--koala-link]"
        onchange={() => selectRenderer(option.value)}
      />
      <span>{option.label}</span>
    </label>
  {/each}
  {#if disabled}
    <span id="renderer-mode-disabled-reason" class="sr-only">{disabledReason}</span>
  {/if}
</fieldset>
