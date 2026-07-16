import type { FileRecord } from '@/db/types'

export interface FileTreeNode {
  name: string
  fullPath: string
  children: Record<string, FileTreeNode>
  items: FileRecord[]
}

export function buildFileTree(files: FileRecord[]) {
  const root: FileTreeNode = { name: '', fullPath: '/', children: {}, items: [] }
  const activeFiles = files
    .filter(file => !file.deletedAt)
    .sort((a, b) => a.path.localeCompare(b.path) || a.createdAt.getTime() - b.createdAt.getTime())

  for (const file of activeFiles) {
    const parts = file.path.split('/').filter(Boolean)
    parts.pop()
    let node = root
    let currentPath = ''

    for (const part of parts) {
      currentPath += `/${part}`
      const prefix = `${currentPath}/`
      node.children[part] ??= { name: part, fullPath: prefix, children: {}, items: [] }
      node = node.children[part]
    }
    node.items.push(file)
  }

  return root
}

export function getTrashedFiles(files: FileRecord[]) {
  return files
    .filter(file => file.deletedAt)
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime() || b.id - a.id)
}
