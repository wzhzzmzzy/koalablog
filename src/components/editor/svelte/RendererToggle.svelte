<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';

  interface Props {
    value: RendererMode;
    disabled: boolean;
    disabledReason?: string;
    onChange: (renderer: RendererMode) => void;
  }

  let { value, disabled, disabledReason = 'Renderer cannot be changed for a recycled File', onChange }: Props = $props();
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
  class="editor-renderer-toggle"
>
  <legend class="sr-only">Renderer Mode</legend>
  {#each options as option}
    <label
      class="editor-renderer-option {disabled ? 'editor-renderer-option--disabled' : ''}"
    >
      <input
        type="radio"
        name="renderer-mode"
        value={option.value}
        checked={value === option.value}
        disabled={disabled}
        title={disabled ? disabledReason : option.label}
        aria-describedby={disabled ? 'renderer-mode-disabled-reason' : undefined}
        class="editor-renderer-option__input"
        onchange={() => selectRenderer(option.value)}
      />
      <span>{option.label}</span>
    </label>
  {/each}
  {#if disabled}
    <span id="renderer-mode-disabled-reason" class="sr-only">{disabledReason}</span>
  {/if}
</fieldset>
