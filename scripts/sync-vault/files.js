import { relative } from 'path'

export const SyncRenderer = Object.freeze({
  Markdown: 'markdown',
  Svelte: 'svelte',
})

export function rendererFromDiskPath(input) {
  const diskPath = input.replaceAll('\\', '/')
  if (diskPath.endsWith('.svelte'))
    return SyncRenderer.Svelte
  if (diskPath.endsWith('.md'))
    return SyncRenderer.Markdown
  return null
}

export function sourceFromVaultPath(vaultPath, diskPath) {
  const renderer = rendererFromDiskPath(diskPath)
  if (!renderer)
    return null
  const relativePath = relative(vaultPath, diskPath).replaceAll('\\', '/')
  const extensionLength = renderer === SyncRenderer.Svelte ? '.svelte'.length : '.md'.length
  const withoutExtension = relativePath.slice(0, -extensionLength)
  if (!withoutExtension || withoutExtension.endsWith('.md') || withoutExtension.endsWith('.svelte'))
    throw new Error(`Invalid source disk Path: ${relativePath}`)
  return { path: `/${withoutExtension}`, renderer }
}

export function vaultPathForSource(vaultPath, sourcePath, renderer = SyncRenderer.Markdown) {
  const extension = renderer === SyncRenderer.Svelte ? '.svelte' : '.md'
  return `${vaultPath.replace(/\/$/, '')}/${sourcePath.replace(/^\/+/, '')}${extension}`
}

export function assertUniqueSourcePaths(files) {
  const sources = new Set()
  for (const file of files) {
    if (sources.has(file.path))
      throw new Error(`Multiple vault Files map to File Path: ${file.path}`)
    sources.add(file.path)
  }
}

export function sourceContentForUpload({ content, renderer }) {
  if (renderer === SyncRenderer.Svelte)
    return content
  return content
    .replace(/!\[\[((?:\.?\/)?attachments\/[^\]]+)\]\]/g, '![](/$1)')
    .replace(/!\[\[((?:\.\.\/)+attachments\/[^\]]+)\]\]/g, (_, path) => `![](/${path.replace(/^(?:\.\.\/)+/, '')})`)
    .replace(/!\[.*?\]\(((?:\.\.\/)+attachments\/[^)]+)\)/g, (_, path) => `![](/${path.replace(/^(?:\.\.\/)+/, '')})`)
    .replace(/\[\[((?:\.\.\/)+attachments\/[^\]|]+)\|([^\]]+)\]\]/g, '[$2]($1)')
    .replace(/\[\[((?:\.\.\/)+attachments\/[^\]|]+)\]\]/g, '[$1]($1)')
}
