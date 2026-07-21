<script module lang="ts">
  import { discardCodeMirrorState } from './text-editor/codemirror-state';

  export interface TextEditorHandle {
    focus: () => void;
    insertImages: (files: File[]) => Promise<void>;
  }

  export function discardEditorState(fileId: number) {
    discardCodeMirrorState(fileId);
  }
</script>

<script lang="ts">
  import CodeMirrorAdapter from './text-editor/codemirror-adapter.svelte';

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

<CodeMirrorAdapter
  bind:this={adapter}
  {fileId}
  {filePath}
  {value}
  {readonly}
  {onChange}
  {uploadImage}
/>
