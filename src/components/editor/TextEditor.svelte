<script module lang="ts">
  import { discardCodeMirrorState } from './text-editor/codemirror-state';

  export interface TextEditorHandle {
    focus: () => void;
    insertImages: (files: File[]) => Promise<void>;
    applySavePreparation: (content: string) => void;
    acknowledgeSavedSource: (content: string) => void;
  }

  export function discardEditorState(fileId: number) {
    discardCodeMirrorState(fileId);
  }
</script>

<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import type { TextEditorDiagnosticUpdate } from './text-editor/diagnostics';
  import type { FileReferenceCandidate } from './text-editor/file-reference-completion';
  import type { TagCompletionCandidate } from './text-editor/tag-completion';
  import CodeMirrorAdapter from './text-editor/codemirror-adapter.svelte';

  interface Props {
    fileId: number;
    filePath: string;
    renderer: RendererMode;
    diagnostics?: TextEditorDiagnosticUpdate | null;
    value: string;
    readonly: boolean;
    referenceCandidates: readonly FileReferenceCandidate[];
    tagCandidates: readonly TagCompletionCandidate[];
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let { fileId, filePath, renderer, diagnostics = null, value, readonly, referenceCandidates, tagCandidates, onChange, uploadImage }: Props = $props();
  let adapter: TextEditorHandle | undefined = $state();

  export function focus() {
    adapter?.focus();
  }

  export async function insertImages(files: File[]) {
    await adapter?.insertImages(files);
  }

  export function applySavePreparation(content: string) {
    adapter?.applySavePreparation(content);
  }

  export function acknowledgeSavedSource(content: string) {
    adapter?.acknowledgeSavedSource(content);
  }
</script>

<CodeMirrorAdapter
  bind:this={adapter}
  {fileId}
  {filePath}
  {renderer}
  {diagnostics}
  {value}
  {readonly}
  {referenceCandidates}
  {tagCandidates}
  {onChange}
  {uploadImage}
/>
