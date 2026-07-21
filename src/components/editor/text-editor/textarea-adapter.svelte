<script lang="ts">
  import { generatePlaceholder, getImagesFromClipboard, getImagesFromDrop, insertTextAtPosition } from '../utils';

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

  export function focus() {
    textarea?.focus();
  }

  async function upload(file: File, placeholder?: string) {
    try {
      const { url } = await uploadImage(file);
      const markdown = `![](${url})`;
      const nextValue = placeholder
        ? value.replace(placeholder, markdown)
        : `${value}\n${markdown}`;
      onChange(nextValue);
    }
    catch {
      if (placeholder) onChange(value.replace(placeholder, ''));
    }
  }

  export async function insertImages(files: File[]) {
    if (readonly) return;
    const image = files.find(file => file.type.startsWith('image/'));
    if (image) await upload(image);
  }

  function insertPendingImages(files: File[], position: number) {
    let nextValue = value;
    const pending: Array<{ file: File; placeholder: string }> = [];

    for (const file of files) {
      const placeholder = generatePlaceholder(file.name);
      nextValue = insertTextAtPosition(nextValue, placeholder, position);
      pending.push({ file, placeholder });
    }

    onChange(nextValue);
    for (const item of pending) void upload(item.file, item.placeholder);
  }

  function handlePaste(event: ClipboardEvent) {
    if (readonly) return;
    const files = getImagesFromClipboard(event);
    if (files.length === 0) return;
    event.preventDefault();
    insertPendingImages(files, textarea?.selectionStart ?? value.length);
  }

  function handleDrop(event: DragEvent) {
    if (readonly) return;
    const files = getImagesFromDrop(event);
    if (files.length === 0) return;
    event.preventDefault();
    insertPendingImages(files, textarea?.selectionStart || value.length);
  }
</script>

<textarea
  bind:this={textarea}
  class="text-sm w-full h-full box-border bg-transparent border-none outline-none resize-none p-2"
  name="content"
  placeholder="Type here..."
  aria-label={`File Source for ${filePath}`}
  data-file-id={fileId}
  {value}
  oninput={(event) => onChange(event.currentTarget.value)}
  onpaste={handlePaste}
  ondrop={handleDrop}
  {readonly}
></textarea>
