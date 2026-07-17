import type { FileRecord } from '@/db/types'
import type { AbsolutePathPrefix } from '@/lib/files/types'
import { parseAbsolutePathPrefix } from '@/lib/files/path'

export interface FileTreeNode {
  name: string
  prefix: AbsolutePathPrefix
  children: Record<string, FileTreeNode>
  items: FileRecord[]
}

function requiredPrefix(input: string): AbsolutePathPrefix {
  const parsed = parseAbsolutePathPrefix(input)
  if (!parsed.ok)
    throw new Error(`Invalid File tree Prefix: ${input}`)
  return parsed.value
}

function ensurePrefixNode(root: FileTreeNode, prefix: AbsolutePathPrefix) {
  if (prefix === '/')
    return root

  const parts = prefix.split('/').filter(Boolean)
  let node = root
  let currentPath = ''
  for (const part of parts) {
    currentPath += `/${part}`
    const childPrefix = requiredPrefix(`${currentPath}/`)
    node.children[part] ??= { name: part, prefix: childPrefix, children: {}, items: [] }
    node = node.children[part]
  }
  return node
}

export function buildFileTree(files: FileRecord[], templatePrefixes: AbsolutePathPrefix[] = []) {
  const root: FileTreeNode = { name: '', prefix: requiredPrefix('/'), children: {}, items: [] }
  const activeFiles = files
    .filter(file => !file.deletedAt)
    .sort((a, b) => a.path.localeCompare(b.path) || a.createdAt.getTime() - b.createdAt.getTime())

  for (const file of activeFiles) {
    const parts = file.path.split('/').filter(Boolean)
    parts.pop()
    const node = ensurePrefixNode(root, requiredPrefix(`/${parts.join('/')}/`))
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
