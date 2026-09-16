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
  import type { ImageUploadProgress, ImageUploadStatus } from './text-editor/images';
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
    uploadImage: (file: File, onProgress: (progress: ImageUploadProgress) => void) => Promise<{ url: string }>;
    onUnresolvedImageUploadsChange: (hasUnresolved: boolean) => void;
  }

  let { fileId, filePath, renderer, diagnostics = null, value, readonly, referenceCandidates, tagCandidates, onChange, uploadImage, onUnresolvedImageUploadsChange }: Props = $props();
  interface AdapterHandle extends TextEditorHandle {
    retryImageUpload: (id: string) => void;
    removeImageUpload: (id: string) => void;
  }
  let adapter: AdapterHandle | undefined = $state();
  let imageUploads = $state<ImageUploadStatus[]>([]);

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

  function updateImageUploads(uploads: ImageUploadStatus[]) {
    imageUploads = uploads;
    onUnresolvedImageUploadsChange(uploads.length > 0);
  }
</script>

<div class="text-editor">
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
    onImageUploadsChange={updateImageUploads}
  />

  {#if imageUploads.length > 0}
    <section class="editor-upload-queue" aria-label="Image uploads">
      <div class="editor-upload-queue__header">
        <strong>Image uploads</strong>
        <span>{imageUploads.length} {imageUploads.length === 1 ? 'item' : 'items'}</span>
      </div>
      <div class="editor-upload-queue__items">
        {#each imageUploads as upload (upload.id)}
          <div class="editor-upload-item editor-upload-item--{upload.state}">
            <div class="editor-upload-item__summary">
              <span class="editor-upload-item__name" title={upload.fileName}>{upload.fileName}</span>
              <span class="editor-upload-item__state">
                {#if upload.state === 'preparing'}
                  Preparing image…
                {:else if upload.state === 'uploading'}
                  Uploading{upload.progress === undefined ? '…' : ` ${upload.progress}%`}
                {:else if upload.state === 'processing'}
                  Processing upload…
                {:else}
                  Upload failed
                {/if}
              </span>
            </div>
            {#if upload.state === 'uploading'}
              <progress
                class="editor-upload-item__progress"
                max="100"
                value={upload.progress}
                aria-label={`Upload progress for ${upload.fileName}`}
              ></progress>
            {:else if upload.state === 'preparing' || upload.state === 'processing'}
              <progress
                class="editor-upload-item__progress"
                max="100"
                aria-label={`${upload.state === 'preparing' ? 'Preparing' : 'Processing'} ${upload.fileName}`}
              ></progress>
            {:else}
              <p class="editor-upload-item__error" role="alert">{upload.error || 'Upload failed. Try again or remove the placeholder.'}</p>
              <div class="editor-upload-item__actions">
                <button type="button" onclick={() => adapter?.retryImageUpload(upload.id)} aria-label={`Retry ${upload.fileName}`}>Retry</button>
                <button type="button" onclick={() => adapter?.removeImageUpload(upload.id)} aria-label={`Remove ${upload.fileName}`}>Remove</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
