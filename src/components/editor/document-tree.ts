import type { Markdown } from '@/db/types'

export interface DocumentTreeNode {
  name: string
  fullPath: string
  children: Record<string, DocumentTreeNode>
  items: Markdown[]
}

export function buildDocumentTree(documents: Markdown[]) {
  const root: DocumentTreeNode = { name: '', fullPath: '', children: {}, items: [] }
  const activeDocuments = documents
    .filter(document => !document.deletedAt)
    .sort((a, b) => a.link.localeCompare(b.link) || a.createdAt.getTime() - b.createdAt.getTime())

  for (const document of activeDocuments) {
    const parts = document.link.split('/')
    parts.pop()
    let node = root
    let currentPath = ''

    for (const part of parts) {
      currentPath += `${part}/`
      node.children[part] ??= { name: part, fullPath: currentPath, children: {}, items: [] }
      node = node.children[part]
    }
    node.items.push(document)
  }

  return root
}

export function getTrashedDocuments(documents: Markdown[]) {
  return documents
    .filter(document => document.deletedAt)
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime() || b.id - a.id)
}
