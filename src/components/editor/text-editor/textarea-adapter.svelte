<script lang="ts">
  import { findImageRemoval, findImageReplacement, imagesFromClipboard, imagesFromDrop, prepareImageBatch, type ImageTextChange, type PendingImage } from './images';

  interface Props {
    fileId: number;
    filePath: string;
    value: string;
    readonly: boolean;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let { fileId, filePath, value, readonly, onChange, uploadImage }: Props = $props();
  let textarea: HTMLTextAreaElement | undefined = $state();
  let documentValue = $state(value);

  $effect(() => {
    documentValue = value;
  });

  export function focus() {
    textarea?.focus();
  }

  function applyChange(change: ImageTextChange | null) {
    if (!change) return;
    documentValue = documentValue.slice(0, change.from) + change.insert + documentValue.slice(change.to);
    onChange(documentValue);
  }

  async function upload(pending: PendingImage) {
    try {
      const { url } = await uploadImage(pending.file);
      applyChange(findImageReplacement(documentValue, pending, url));
    }
    catch {
      applyChange(findImageRemoval(documentValue, pending));
    }
  }

  export function insertImages(files: File[]): Promise<void> {
    if (readonly) return Promise.resolve();
    const batch = prepareImageBatch(files);
    if (batch.items.length === 0) return Promise.resolve();
    const from = textarea?.selectionStart ?? documentValue.length;
    const to = textarea?.selectionEnd ?? from;
    documentValue = documentValue.slice(0, from) + batch.text + documentValue.slice(to);
    onChange(documentValue);
    for (const pending of batch.items) void upload(pending);
    return Promise.resolve();
  }

  function handlePaste(event: ClipboardEvent) {
    if (readonly) return;
    const files = imagesFromClipboard(event);
    if (files.length === 0) return;
    event.preventDefault();
    void insertImages(files);
  }

  function handleDrop(event: DragEvent) {
    if (readonly) return;
    const files = imagesFromDrop(event);
    if (files.length === 0) return;
    event.preventDefault();
    void insertImages(files);
  }
</script>

<textarea
  bind:this={textarea}
  class="text-sm w-full h-full box-border bg-transparent border-none outline-none resize-none p-2"
  name="content"
  placeholder="Type here..."
  aria-label={`File Source for ${filePath}`}
  data-file-id={fileId}
  value={documentValue}
  oninput={(event) => {
    documentValue = event.currentTarget.value;
    onChange(documentValue);
  }}
  onpaste={handlePaste}
  ondrop={handleDrop}
  {readonly}
></textarea>
