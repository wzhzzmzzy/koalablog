<script module lang="ts">
  export interface TextEditorHandle {
    focus: () => void;
    insertImages: (files: File[]) => Promise<void>;
  }

  export function discardEditorState(fileId: number) {
    void fileId;
  }
</script>

<script lang="ts">
  import { TEXT_EDITOR_ADAPTER } from './text-editor/adapter-selection';
  import TextareaAdapter from './text-editor/textarea-adapter.svelte';

  interface Props {
    fileId: number;
    filePath: string;
    value: string;
    readonly: boolean;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let { fileId, filePath, value, readonly, onChange, uploadImage }: Props = $props();
  let adapter: TextEditorHandle | undefined = $state();

  export function focus() {
    adapter?.focus();
  }

  export async function insertImages(files: File[]) {
    await adapter?.insertImages(files);
  }
</script>

{#if TEXT_EDITOR_ADAPTER === 'textarea'}
  <TextareaAdapter
    bind:this={adapter}
    {fileId}
    {filePath}
    {value}
    {readonly}
    {onChange}
    {uploadImage}
  />
{/if}
