<script lang="ts">
  import { Editor } from 'bytemd';
  import gfm from '@bytemd/plugin-gfm';
  import 'bytemd/dist/index.css';

  interface Props {
    value: string;
    onChange: (v: string) => void;
  }

  let { value, onChange }: Props = $props();

  const plugins = [
    gfm(),
  ];

  function handleChange(e: any) {
    onChange(e.detail.value);
  }
</script>

<div class="bytemd-container h-full">
  <Editor
    {value}
    {plugins}
    mode="tab"
    on:change={handleChange}
  />
</div>

<style>
  .bytemd-container {
    height: 100%;
    width: 100%;
  }
  
  :global(.bytemd) {
    height: 100%;
    border: none;
  }
  
  /* Hide the mode switcher (Write/Preview) since we have a dedicated preview panel */
  :global(.bytemd-toolbar-right > .bytemd-toolbar-item:last-child) {
    display: none;
  }
</style>
