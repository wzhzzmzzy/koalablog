import type { FileRecord } from '@/db/types'
import { parseAbsolutePathPrefix } from '@/lib/files/path'

export interface FileTreeNode {
  name: string
  fullPath: string
  children: Record<string, FileTreeNode>
  items: FileRecord[]
}

function ensurePrefixNode(root: FileTreeNode, prefixInput: string) {
  const parsed = parseAbsolutePathPrefix(prefixInput)
  if (!parsed.ok || parsed.value === '/')
    return root

  const parts = parsed.value.split('/').filter(Boolean)
  let node = root
  let currentPath = ''
  for (const part of parts) {
    currentPath += `/${part}`
    const prefix = `${currentPath}/`
    node.children[part] ??= { name: part, fullPath: prefix, children: {}, items: [] }
    node = node.children[part]
  }
  return node
}

export function buildFileTree(files: FileRecord[], templatePrefixes: string[] = []) {
  const root: FileTreeNode = { name: '', fullPath: '/', children: {}, items: [] }
  const activeFiles = files
    .filter(file => !file.deletedAt)
    .sort((a, b) => a.path.localeCompare(b.path) || a.createdAt.getTime() - b.createdAt.getTime())

  for (const file of activeFiles) {
    const parts = file.path.split('/').filter(Boolean)
    parts.pop()
    const node = ensurePrefixNode(root, `/${parts.join('/')}/`)
    node.items.push(file)
  }

  for (const prefix of templatePrefixes)
    ensurePrefixNode(root, prefix)

  return root
}

export function getTrashedFiles(files: FileRecord[]) {
  return files
    .filter(file => file.deletedAt)
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime() || b.id - a.id)
}

export function isFileTreeEmpty(tree: FileTreeNode) {
  return tree.items.length === 0 && Object.keys(tree.children).length === 0
}
